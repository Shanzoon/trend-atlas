import { categoryDefinitions, categoryFor } from "./categories.js?v=20260829-image2";
import { elements } from "./elements.js?v=20260829-image2";
import { scheduleStoryUpdate } from "./home.js?v=20260829-image2";
import { itemsForScope, nextCollectionPageEnd, state } from "./state.js?v=20260829-image2";
import { hashString, stableDateKey } from "./utils.js?v=20260829-image2";

let dailyDeck = [];
const dailyLayers = [elements.dailyImage, elements.dailyImageIncoming];
let dailyActiveLayer = dailyLayers[0];
let dailySwitchSeq = 0;
let dailyPendingItem = null;
const detailLayers = [elements.detailImage, elements.detailImageIncoming];
let detailActiveLayer = null;
let detailSwitchSeq = 0;
let detailPendingIndex = null;
let detailFailedIndex = null;
let detailFailedUpdateHash = true;
const imageLoadControllers = new WeakMap();
let adjacentPreloadLinks = [];
const MAX_ADJACENT_PRELOADS = 2;
const SWITCH_INTENT_DELAY_MS = 70;

function setImageDimensions(image, item) {
  if (item.width && item.height) {
    image.width = item.width;
    image.height = item.height;
  } else {
    image.removeAttribute("width");
    image.removeAttribute("height");
  }
}

function cancelImageLoad(image, clearSource = false) {
  imageLoadControllers.get(image)?.abort();
  imageLoadControllers.delete(image);
  if (clearSource) {
    image.removeAttribute("src");
    image.removeAttribute("width");
    image.removeAttribute("height");
    image.alt = "";
  }
}

function releaseInactiveLayer(image, isActive, delay) {
  setTimeout(() => {
    if (isActive() || imageLoadControllers.has(image)) return;
    image.removeAttribute("src");
    image.removeAttribute("width");
    image.removeAttribute("height");
    image.alt = "";
  }, delay);
}

function loadAndDecodeImage(image, item, priority = "auto") {
  cancelImageLoad(image);
  const controller = new AbortController();
  imageLoadControllers.set(image, controller);
  const expectedSrc = new URL(item.src, location.href).href;

  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.fetchPriority = priority;
  setImageDimensions(image, item);

  const loaded = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const onAbort = () => finish(reject, new DOMException("Image load superseded", "AbortError"));
    const onError = () => finish(reject, new Error(`图片加载失败：${item.src}`));
    const onLoad = () => {
      if (image.currentSrc === expectedSrc || image.src === expectedSrc) finish(resolve);
    };

    controller.signal.addEventListener("abort", onAbort, { once: true });
    image.addEventListener("load", onLoad, { once: true, signal: controller.signal });
    image.addEventListener("error", onError, { once: true, signal: controller.signal });
    image.src = item.src;
    if (image.complete) queueMicrotask(() => (image.naturalWidth ? onLoad() : onError()));
  });

  return loaded
    .then(async () => {
      if (typeof image.decode === "function") await image.decode();
      if (controller.signal.aborted || image.currentSrc !== expectedSrc || !image.naturalWidth) {
        throw new DOMException("Image load superseded", "AbortError");
      }
      return image;
    })
    .finally(() => {
      if (imageLoadControllers.get(image) === controller) imageLoadControllers.delete(image);
    });
}

function setAdjacentPreloads(items) {
  adjacentPreloadLinks.forEach((link) => link.remove());
  adjacentPreloadLinks = [...new Map(items.filter(Boolean).map((item) => [item.src, item])).values()]
    .slice(0, MAX_ADJACENT_PRELOADS)
    .map((item) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "image";
      link.href = item.src;
      link.fetchPriority = "low";
      document.head.append(link);
      return link;
    });
}

function waitForSettledSwitchIntent() {
  return new Promise((resolve) => setTimeout(resolve, SWITCH_INTENT_DELAY_MS));
}

function setDailyLayerAccessibility(visibleLayer) {
  dailyLayers.forEach((layer) => {
    if (layer === visibleLayer) layer.removeAttribute("aria-hidden");
    else layer.setAttribute("aria-hidden", "true");
  });
}

function setDailyStatus(message = "", isError = false, isLoading = false) {
  elements.homeStatus.textContent = message;
  elements.homeStatus.classList.toggle("is-error", isError);
  elements.homeStatus.classList.toggle("is-loading", isLoading);
}

function updateDailyControlLabel(item) {
  elements.dailyImageWrap.setAttribute("aria-label", `当前精选：${item.title}，点击换一张`);
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
    dailyDeck = shuffle(candidates.filter((item) => item !== state.dailyItem && item !== dailyPendingItem));
  }
  return dailyDeck.pop();
}

function preloadNextDailyItem() {
  const candidates = itemsForScope("01-Dreamscape");
  if (candidates.length < 2) {
    setAdjacentPreloads([]);
    return;
  }
  if (!dailyDeck.length) dailyDeck = shuffle(candidates.filter((item) => item !== state.dailyItem));
  setAdjacentPreloads([dailyDeck.at(-1)]);
}

function commitDailyItem(item, layer) {
  const outgoing = dailyActiveLayer;
  state.dailyItem = item;
  dailyPendingItem = null;
  elements.dailyArt.hidden = false;
  layer.alt = `${item.title}，${item.categoryLabel}`;
  layer.classList.add("is-active");
  outgoing.classList.remove("is-active");
  dailyActiveLayer = layer;
  releaseInactiveLayer(outgoing, () => outgoing === dailyActiveLayer, 360);
  setDailyLayerAccessibility(dailyActiveLayer);
  updateDailyControlLabel(item);
  setDailyStatus();
  elements.dailyImageWrap.classList.remove("is-loading");
  elements.dailyImageWrap.setAttribute("aria-busy", "false");
  preloadNextDailyItem();
}

async function requestDailyItem(item) {
  const seq = ++dailySwitchSeq;
  setAdjacentPreloads([]);
  dailyLayers
    .filter((layer) => layer !== dailyActiveLayer && imageLoadControllers.has(layer))
    .forEach((layer) => cancelImageLoad(layer, true));
  dailyPendingItem = item;
  elements.dailyArt.hidden = false;
  elements.dailyImageWrap.classList.add("is-loading");
  elements.dailyImageWrap.setAttribute("aria-busy", "true");
  setDailyStatus(state.dailyItem ? "正在加载下一张图像" : "正在加载今日精选", false, true);

  if (state.dailyItem) {
    await waitForSettledSwitchIntent();
    if (seq !== dailySwitchSeq || state.page !== "home") return;
  }

  const targetLayer = dailyLayers.find((layer) => layer !== dailyActiveLayer);
  try {
    await loadAndDecodeImage(targetLayer, item, state.dailyItem ? "auto" : "high");
    if (seq !== dailySwitchSeq || state.page !== "home") return;
    commitDailyItem(item, targetLayer);
  } catch (error) {
    if (seq !== dailySwitchSeq || error.name === "AbortError") return;
    dailyPendingItem = null;
    if (!dailyDeck.includes(item)) dailyDeck.push(item);
    elements.dailyImageWrap.classList.remove("is-loading");
    elements.dailyImageWrap.setAttribute("aria-busy", "false");
    setDailyStatus("新图加载失败，当前精选保持不变。请再试一次。", true);
  }
}

function cancelDailyRequest() {
  dailySwitchSeq += 1;
  dailyPendingItem = null;
  dailyLayers.filter((layer) => layer !== dailyActiveLayer).forEach((layer) => cancelImageLoad(layer, true));
  elements.dailyImageWrap.classList.remove("is-loading");
  elements.dailyImageWrap.setAttribute("aria-busy", "false");
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
  if (page !== "home") cancelDailyRequest();
  if (page !== "detail") cancelDetailRequest(true);
  setAdjacentPreloads([]);
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
  if (state.dailyItem) {
    preloadNextDailyItem();
    return;
  }
  if (dailyPendingItem) return;
  const item = selectDailyItem();
  if (!item) {
    elements.dailyArt.hidden = true;
    elements.homeStatus.textContent = "今天暂时没有可用图像";
    elements.homeStatus.classList.add("is-error");
    return;
  }
  requestDailyItem(item);
}

export function switchDailyItem() {
  const item = nextDailyItem();
  if (!item || item === state.dailyItem) return;
  requestDailyItem(item);
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

function setDetailStatus(message = "", showRetry = false) {
  elements.detailStatus.textContent = message;
  elements.detailRetry.hidden = !showRetry;
}

function updateDetailMetadata(item, index) {
  elements.detailTitle.textContent = item.title;
  elements.detailCounter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(state.activeItems.length).padStart(2, "0")}`;
  elements.detailMeta.textContent = `${item.categoryLabel} · ${item.date}`;
  document.title = "shanzoon.art";

  // 线性翻页：到列表两端时隐藏对应按钮，避免死胡同或环形瞬移。
  elements.detailPrevious.hidden = index <= 0;
  elements.detailNext.hidden = index >= state.activeItems.length - 1;
}

function resetDetailFrame(item) {
  detailSwitchSeq += 1;
  detailPendingIndex = null;
  detailFailedIndex = null;
  detailActiveLayer = null;
  detailLayers.forEach((layer) => {
    cancelImageLoad(layer);
    layer.classList.remove("is-active");
    layer.removeAttribute("src");
    layer.alt = "";
    layer.setAttribute("aria-hidden", "true");
  });
  elements.detailImageWrap.classList.add("is-empty");
  elements.detailImageWrap.classList.remove("is-loading");
  elements.detailImageWrap.setAttribute("aria-busy", "false");
  if (item.width && item.height) {
    elements.detailImageWrap.style.setProperty("--detail-aspect", `${item.width} / ${item.height}`);
  } else {
    elements.detailImageWrap.style.removeProperty("--detail-aspect");
  }
  elements.detailCounter.textContent = "";
  elements.detailTitle.textContent = "";
  elements.detailMeta.textContent = "";
  elements.detailPrevious.hidden = true;
  elements.detailNext.hidden = true;
  setDetailStatus();
}

function cancelDetailRequest(releaseActiveLayer = false) {
  detailSwitchSeq += 1;
  detailPendingIndex = null;
  detailFailedIndex = null;
  detailLayers
    .filter((layer) => releaseActiveLayer || layer !== detailActiveLayer)
    .forEach((layer) => {
      cancelImageLoad(layer, true);
      layer.classList.remove("is-active");
      layer.setAttribute("aria-hidden", "true");
    });
  if (releaseActiveLayer) detailActiveLayer = null;
  elements.detailImageWrap.classList.remove("is-loading");
  elements.detailImageWrap.setAttribute("aria-busy", "false");
}

function preloadDetailNeighbors(index) {
  setAdjacentPreloads([
    state.activeItems[index - 1],
    state.activeItems[index + 1],
  ]);
}

function restoreDetailControlFocus(focusedControl) {
  if (focusedControl === elements.detailPrevious && elements.detailPrevious.hidden) {
    (elements.detailNext.hidden ? elements.detailTitle : elements.detailNext).focus({ preventScroll: true });
  }
  if (focusedControl === elements.detailNext && elements.detailNext.hidden) {
    (elements.detailPrevious.hidden ? elements.detailTitle : elements.detailPrevious).focus({ preventScroll: true });
  }
}

async function requestDetailItem(index, updateHash = true, focusHeading = false) {
  if (!state.activeItems.length) return;
  const targetIndex = Math.min(Math.max(index, 0), state.activeItems.length - 1);
  const item = state.activeItems[targetIndex];
  const items = state.activeItems;
  const scope = state.detailScope;
  const focusedControl = document.activeElement;
  const hasVisibleImage = Boolean(detailActiveLayer);
  const seq = ++detailSwitchSeq;

  setAdjacentPreloads([]);
  detailLayers
    .filter((layer) => layer !== detailActiveLayer && imageLoadControllers.has(layer))
    .forEach((layer) => cancelImageLoad(layer, true));
  state.detailTargetIndex = targetIndex;
  detailPendingIndex = targetIndex;
  detailFailedIndex = null;
  elements.detailImageWrap.classList.add("is-loading");
  elements.detailImageWrap.setAttribute("aria-busy", "true");
  if (!detailActiveLayer && item.width && item.height) {
    elements.detailImageWrap.style.setProperty("--detail-aspect", `${item.width} / ${item.height}`);
  }
  setDetailStatus(detailActiveLayer ? "" : "正在加载图像");

  if (hasVisibleImage) {
    await waitForSettledSwitchIntent();
    if (seq !== detailSwitchSeq || state.page !== "detail" || state.activeItems !== items || state.detailScope !== scope) return;
  }

  const targetLayer = detailActiveLayer
    ? detailLayers.find((layer) => layer !== detailActiveLayer)
    : detailLayers[0];
  try {
    await loadAndDecodeImage(targetLayer, item, detailActiveLayer ? "auto" : "high");
    if (seq !== detailSwitchSeq || state.page !== "detail" || state.activeItems !== items || state.detailScope !== scope) return;

    const outgoing = detailActiveLayer;
    outgoing?.classList.remove("is-active");
    outgoing?.setAttribute("aria-hidden", "true");
    targetLayer.alt = `${item.title}，${item.categoryLabel}`;
    targetLayer.removeAttribute("aria-hidden");
    targetLayer.classList.add("is-active");
    detailActiveLayer = targetLayer;
    if (outgoing) releaseInactiveLayer(outgoing, () => outgoing === detailActiveLayer, 0);
    state.detailIndex = targetIndex;
    state.detailTargetIndex = targetIndex;
    detailPendingIndex = null;
    elements.detailImageWrap.classList.remove("is-loading", "is-empty");
    elements.detailImageWrap.setAttribute("aria-busy", "false");
    setDetailStatus();
    updateDetailMetadata(item, targetIndex);
    if (updateHash) history.replaceState(history.state, "", detailHash(scope, item));
    preloadDetailNeighbors(targetIndex);
    restoreDetailControlFocus(focusedControl);
    if (focusHeading) focusPageHeading(elements.detailTitle);
  } catch (error) {
    if (seq !== detailSwitchSeq || error.name === "AbortError") return;
    detailPendingIndex = null;
    detailFailedIndex = targetIndex;
    detailFailedUpdateHash = updateHash;
    state.detailTargetIndex = detailActiveLayer ? state.detailIndex : targetIndex;
    elements.detailImageWrap.classList.remove("is-loading");
    elements.detailImageWrap.setAttribute("aria-busy", "false");
    setDetailStatus(detailActiveLayer ? "新图加载失败，仍显示上一张。" : "图像加载失败。", true);
  }
}

function focusPageHeading(heading) {
  if (!heading) return;
  requestAnimationFrame(() => heading.focus({ preventScroll: true }));
}

export function navigateHome(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  setPage("home");
  renderDailyItem();
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
  cancelDetailRequest();
  if (previousPage === "home") state.homeScrollY = scrollY;
  if (previousPage === "collection") state.archiveScrollY = scrollY;

  state.activeItems = scopedItems;
  state.detailTargetIndex = itemIndex;
  state.detailScope = scope;
  state.detailSource = previousPage === "collection" ? "collection" : "home";
  if (previousPage !== "detail") resetDetailFrame(item);
  setPage("detail");

  if (updateHash) history.pushState({ source: previousPage }, "", detailHash(scope, item));
  requestDetailItem(itemIndex, previousPage === "detail" && updateHash, previousPage !== "detail");
  window.scrollTo({ top: 0, left: 0 });
}

function selectDetail(index, updateHash = true) {
  if (!state.activeItems.length) return;
  const targetIndex = Math.min(Math.max(index, 0), state.activeItems.length - 1);
  if (targetIndex === detailPendingIndex) return;
  if (targetIndex === state.detailIndex && detailActiveLayer) {
    if (detailPendingIndex !== null) cancelDetailRequest();
    state.detailTargetIndex = state.detailIndex;
    setDetailStatus();
    return;
  }
  requestDetailItem(targetIndex, updateHash);
}

export function moveDetail(direction) {
  selectDetail(state.detailTargetIndex + direction);
}

export function retryDetailImage() {
  if (detailFailedIndex === null || state.page !== "detail") return;
  requestDetailItem(detailFailedIndex, detailFailedUpdateHash, !detailActiveLayer);
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
