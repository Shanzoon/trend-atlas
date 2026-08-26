import { categoryDefinitions, categoryFor } from "./categories.js";
import { elements } from "./elements.js";
import { scheduleStoryUpdate } from "./home.js";
import { reduceMotion } from "./media.js";
import { itemsForScope, nextCollectionPageEnd, state } from "./state.js";
import { hashString, stableDateKey } from "./utils.js";

let dailyDeck = [];
// 交叉淡入淡出的双层图片：带 is-active 的一层是当前展示层，另一层预载新图后淡入顶替。
const dailyLayers = [elements.dailyImage, elements.dailyImageIncoming];
let dailyActiveLayer = dailyLayers[0];
let dailySwitchSeq = 0;
let dailyFadeTimer = null;
const DAILY_CROSSFADE_MS = 320;

function setDailyLayerAccessibility(visibleLayer) {
  dailyLayers.forEach((layer) => {
    if (layer === visibleLayer) layer.removeAttribute("aria-hidden");
    else layer.setAttribute("aria-hidden", "true");
  });
}

function setDailyStatus(message = "", isError = false) {
  elements.homeStatus.textContent = message;
  elements.homeStatus.classList.toggle("is-error", isError);
}

function updateDailyControlLabel(item) {
  elements.dailyImageWrap.setAttribute("aria-label", `当前精选：${item.title}，点击换一张`);
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.decoding = "async";
    probe.addEventListener("load", () => resolve(true), { once: true });
    probe.addEventListener("error", () => resolve(false), { once: true });
    probe.src = src;
  });
}

// 把进行中的淡入快进到终态：新层顶替为当前层，旧层清空待用。
// 快进期间临时禁用过渡，保证旧图不闪回。
function finishDailyFade() {
  if (dailyFadeTimer) {
    clearTimeout(dailyFadeTimer);
    dailyFadeTimer = null;
  }
  const wrap = elements.dailyImageWrap;
  if (!wrap.classList.contains("is-crossfading")) return;
  const outgoing = dailyActiveLayer;
  const incoming = dailyLayers.find((layer) => layer !== outgoing);
  dailyLayers.forEach((layer) => { layer.style.transition = "none"; });
  wrap.classList.remove("is-crossfading");
  outgoing.classList.remove("is-active");
  incoming.classList.add("is-active");
  outgoing.removeAttribute("src");
  outgoing.alt = "";
  dailyActiveLayer = incoming;
  setDailyLayerAccessibility(dailyActiveLayer);
  void wrap.offsetWidth;
  dailyLayers.forEach((layer) => { layer.style.transition = ""; });
}

function shuffle(items) {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function selectDailyItem() {
  const candidates = itemsForScope("01-Dreamscape");
  if (!candidates.length) return null;
  return candidates[hashString(stableDateKey()) % candidates.length];
}

// 洗牌队列：每次点击换图都保证拿到一张未看过的图，队列耗尽后重新洗牌
// （排除当前展示项，避免刚换完又点回同一张）。
function nextDailyItem() {
  const candidates = itemsForScope("01-Dreamscape");
  if (!candidates.length) return null;
  if (candidates.length === 1) return state.dailyItem || candidates[0];
  if (!dailyDeck.length) {
    dailyDeck = shuffle(candidates.filter((item) => item !== state.dailyItem));
  }
  return dailyDeck.pop();
}

function displayDailyItem(item) {
  state.dailyItem = item;
  elements.dailyArt.hidden = false;
  dailyActiveLayer.src = item.src;
  dailyActiveLayer.alt = `${item.title}，${item.categoryLabel}`;
  dailyActiveLayer.classList.add("is-active");
  setDailyLayerAccessibility(dailyActiveLayer);
  updateDailyControlLabel(item);
  setDailyStatus();
}

function detailHash(scope, item) {
  return `#detail/${encodeURIComponent(scope)}/${encodeURIComponent(item.src)}`;
}

function archiveHash(scope) {
  return scope === "all" ? "#archive" : `#archive/${encodeURIComponent(scope)}`;
}

function collectionItems() {
  return itemsForScope(state.collectionScope);
}

function syncCollectionScope(scope) {
  state.collectionScope = scope;
  elements.collectionFilters.querySelectorAll(".collection-filter").forEach((button) => {
    const active = button.dataset.scope === scope;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  state.collectionRenderedCount = 0;
  elements.collectionGrid.replaceChildren();
}

function setCollectionScope(scope) {
  if (state.collectionScope === scope) return;
  syncCollectionScope(scope);
  renderCollection();
  if (location.hash !== archiveHash(scope)) history.pushState({ source: "collection" }, "", archiveHash(scope));
}

export function initCollectionFilters() {
  const filters = [{ scope: "all", label: "全部" }, ...categoryDefinitions.map(({ id, label }) => ({ scope: id, label }))];
  filters.forEach(({ scope, label }) => {
    const button = document.createElement("button");
    button.className = "collection-filter";
    button.type = "button";
    button.dataset.scope = scope;
    button.setAttribute("aria-pressed", "false");
    button.textContent = label;
    button.addEventListener("click", () => setCollectionScope(scope));
    elements.collectionFilters.append(button);
  });
}

function setPage(page) {
  state.page = page;
  document.body.dataset.page = page;
  elements.story.hidden = page !== "home";
  elements.homeContinuation.hidden = page !== "home";
  elements.collectionPage.hidden = page !== "collection";
  elements.detailPage.hidden = page !== "detail";
  elements.galleryBack.hidden = page === "home";

  if (page === "collection") elements.galleryBackLabel.textContent = "返回首页";
  if (page === "detail") {
    // 按真实来源定文案：从图库进详情（含筛选）返回图库，从首页进返回首页。
    elements.galleryBackLabel.textContent = state.detailSource === "collection" ? "返回图库" : "返回首页";
  }
}

function restoreScroll(top) {
  requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: "auto" }));
}

export function hydrateFolderCovers() {
  elements.portalButtons.forEach((button) => {
    const definition = categoryFor(button.dataset.category);
    const imageLayer = button.querySelector(".folder-image");
    const image = imageLayer.querySelector("img");
    imageLayer.classList.add("is-preview-main");
    image.src = definition.preview;
    image.alt = "";
    image.decoding = "async";
    button.addEventListener("click", () => {
      // 落点固定为列表第一张（最新收录），保证进入后往后翻页是完整的一段。
      const firstItem = itemsForScope(definition.id)[0];
      if (firstItem) navigateToDetail(firstItem, definition.id);
    });
  });
}

export function renderDailyItem() {
  const item = selectDailyItem();
  if (!item) {
    elements.dailyArt.hidden = true;
    elements.homeStatus.textContent = "今天暂时没有可用图像";
    elements.homeStatus.classList.add("is-error");
    return;
  }
  displayDailyItem(item);
}

export function switchDailyItem() {
  const item = nextDailyItem();
  if (!item || item === state.dailyItem) return;
  const seq = ++dailySwitchSeq;
  // 先预加载新图，加载完成前旧图一直留在画面上，切换全程没有空窗。
  preloadImage(item.src).then((loaded) => {
    if (seq !== dailySwitchSeq) {
      // 已被更新的点击取代：把这张图放回洗牌队列，避免丢失。
      dailyDeck.push(item);
      return;
    }
    if (!loaded) {
      setDailyStatus("新图加载失败，当前精选保持不变。请再试一次。", true);
      return;
    }
    state.dailyItem = item;
    if (reduceMotion.matches) {
      finishDailyFade();
      displayDailyItem(item);
      return;
    }
    // 新图已就绪：旧层淡出、新层淡入。
    finishDailyFade();
    const wrap = elements.dailyImageWrap;
    const nextLayer = dailyLayers.find((layer) => layer !== dailyActiveLayer);
    nextLayer.src = item.src;
    nextLayer.alt = `${item.title}，${item.categoryLabel}`;
    setDailyLayerAccessibility(nextLayer);
    updateDailyControlLabel(item);
    setDailyStatus();
    wrap.classList.remove("is-crossfading");
    void wrap.offsetWidth;
    wrap.classList.add("is-crossfading");
    dailyFadeTimer = setTimeout(finishDailyFade, DAILY_CROSSFADE_MS + 60);
  });
}

function updateCollectionMore() {
  const items = collectionItems();
  const hasMore = state.collectionRenderedCount < items.length;
  elements.collectionMore.hidden = !hasMore;
  elements.collectionMore.setAttribute(
    "aria-label",
    `加载更多图像，已显示 ${state.collectionRenderedCount} 张，共 ${items.length} 张`,
  );
}

export function renderNextCollectionPage() {
  const items = collectionItems();
  const pageEnd = nextCollectionPageEnd(state.collectionRenderedCount, items.length);
  const fragment = document.createDocumentFragment();

  items.slice(state.collectionRenderedCount, pageEnd).forEach((item) => {
    const card = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    card.dataset.category = item.category;
    card.setAttribute("aria-label", `查看 ${item.title}，归档于 ${item.date}`);
    image.loading = "lazy";
    image.decoding = "async";
    image.src = item.src;
    image.alt = `${item.title}，${item.categoryLabel}`;
    if (item.width && item.height) {
      image.width = item.width;
      image.height = item.height;
    }
    card.querySelector("strong").textContent = item.title;
    card.querySelector("small").textContent = item.date;
    // 详情翻页范围跟随当前筛选分类。
    card.addEventListener("click", () => navigateToDetail(item, state.collectionScope));
    fragment.append(card);
  });

  elements.collectionGrid.append(fragment);
  state.collectionRenderedCount = pageEnd;
  updateCollectionMore();
}

function renderCollection() {
  const items = collectionItems();
  elements.collectionCount.textContent = `${items.length} 张图像`;

  if (!items.length) {
    if (!elements.collectionGrid.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "empty-collection";
      empty.textContent = "归档中暂时还没有图像。";
      elements.collectionGrid.append(empty);
    }
    updateCollectionMore();
    return;
  }

  if (!state.collectionRenderedCount) renderNextCollectionPage();
  else updateCollectionMore();
}

function renderDetail() {
  const item = state.activeItems[state.detailIndex];
  if (!item) return;

  elements.detailImage.src = item.src;
  elements.detailImage.alt = `${item.title}，${item.categoryLabel}`;
  elements.detailTitle.textContent = item.title;
  elements.detailCounter.textContent = `${String(state.detailIndex + 1).padStart(2, "0")} / ${String(state.activeItems.length).padStart(2, "0")}`;
  elements.detailMeta.textContent = `${item.categoryLabel} · ${item.date}`;
  document.title = "shanzoon.art";

  // 线性翻页：到列表两端时隐藏对应按钮，避免死胡同或环形瞬移。
  elements.detailPrevious.hidden = state.detailIndex <= 0;
  elements.detailNext.hidden = state.detailIndex >= state.activeItems.length - 1;
}

function focusPageHeading(heading) {
  if (!heading) return;
  requestAnimationFrame(() => heading.focus({ preventScroll: true }));
}

export function navigateHome(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  setPage("home");
  document.title = "shanzoon.art";
  if (updateHash && location.hash !== "#home") history.pushState({ source: previousPage }, "", "#home");
  if (restorePosition) restoreScroll(state.homeScrollY);
  else window.scrollTo({ top: 0, left: 0 });
  if (previousPage !== "home") focusPageHeading(elements.brandName);
  scheduleStoryUpdate();
}

export function navigateToArchive(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  if (previousPage === "home") state.homeScrollY = scrollY;
  syncCollectionScope(state.collectionScope);
  setPage("collection");
  renderCollection();
  document.title = "shanzoon.art";
  if (updateHash && location.hash !== archiveHash(state.collectionScope)) {
    history.pushState({ source: previousPage }, "", archiveHash(state.collectionScope));
  }
  if (restorePosition) restoreScroll(state.archiveScrollY);
  else window.scrollTo({ top: 0, left: 0 });
  if (previousPage !== "collection") focusPageHeading(elements.collectionTitle);
}

function navigateToDetail(item, scope, updateHash = true) {
  const scopedItems = itemsForScope(scope);
  const itemIndex = scopedItems.findIndex((candidate) => candidate.src === item.src);
  if (itemIndex < 0) return;

  const previousPage = state.page;
  if (previousPage === "home") state.homeScrollY = scrollY;
  if (previousPage === "collection") state.archiveScrollY = scrollY;

  state.activeItems = scopedItems;
  state.detailIndex = itemIndex;
  state.detailScope = scope;
  state.detailSource = previousPage === "collection" ? "collection" : "home";
  setPage("detail");
  renderDetail();

  if (updateHash) history.pushState({ source: previousPage }, "", detailHash(scope, item));
  window.scrollTo({ top: 0, left: 0 });
  if (previousPage !== "detail") focusPageHeading(elements.detailTitle);
}

function selectDetail(index, updateHash = true) {
  if (!state.activeItems.length) return;
  const focusedControl = document.activeElement;
  state.detailIndex = Math.min(Math.max(index, 0), state.activeItems.length - 1);
  renderDetail();
  if (updateHash) {
    const item = state.activeItems[state.detailIndex];
    history.replaceState(history.state, "", detailHash(state.detailScope, item));
  }
  if (focusedControl === elements.detailPrevious && elements.detailPrevious.hidden) {
    (elements.detailNext.hidden ? elements.detailTitle : elements.detailNext).focus({ preventScroll: true });
  }
  if (focusedControl === elements.detailNext && elements.detailNext.hidden) {
    (elements.detailPrevious.hidden ? elements.detailTitle : elements.detailPrevious).focus({ preventScroll: true });
  }
}

export function moveDetail(direction) {
  selectDetail(state.detailIndex + direction);
}

export function routeFromHash() {
  if (!state.allItems.length) return;

  const safeDecode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  };

  const archiveMatch = location.hash.match(/^#archive\/([^/]+)$/);
  if (location.hash === "#archive" || archiveMatch) {
    const scope = archiveMatch ? safeDecode(archiveMatch[1]) : "all";
    if (scope === "all" || categoryFor(scope)) {
      syncCollectionScope(scope);
      navigateToArchive(false, state.page === "detail" && state.detailSource === "collection");
      return;
    }
  }

  const detailMatch = location.hash.match(/^#detail\/([^/]+)\/(.+)$/);
  if (detailMatch) {
    const scope = safeDecode(detailMatch[1]);
    const src = safeDecode(detailMatch[2]);
    const item = state.allItems.find((candidate) => candidate.src === src);
    if (item && itemsForScope(scope).some((candidate) => candidate.src === src)) {
      navigateToDetail(item, scope, false);
      return;
    }
  }

  const legacyMatch = location.hash.match(/^#gallery\/(.+)$/);
  if (legacyMatch) {
    const scope = safeDecode(legacyMatch[1]);
    const firstItem = itemsForScope(scope)[0];
    if (firstItem) {
      navigateToDetail(firstItem, scope, false);
      return;
    }
  }

  navigateHome(false, state.page === "collection" || (state.page === "detail" && state.detailSource === "home"));
}
