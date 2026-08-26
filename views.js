import { categoryFor } from "./categories.js";
import { elements } from "./elements.js";
import { scheduleStoryUpdate } from "./home.js";
import { reduceMotion } from "./media.js";
import { itemsForScope, nextCollectionPageEnd, state } from "./state.js";
import { hashString, stableDateKey } from "./utils.js";

let detailThumbnailObserver;

function hydrateDetailThumbnail(image) {
  if (!image?.dataset.src) return;
  image.src = image.dataset.src;
  delete image.dataset.src;
  detailThumbnailObserver?.unobserve(image);
}

let dailyDeck = [];

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
  elements.dailyImage.src = item.src;
  elements.dailyImage.alt = `${item.title}，${item.categoryLabel}`;
  elements.homeStatus.textContent = "";
  elements.homeStatus.classList.remove("is-error");
}

function detailHash(scope, item) {
  return `#detail/${encodeURIComponent(scope)}/${encodeURIComponent(item.src)}`;
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
    elements.galleryBackLabel.textContent = state.detailScope === "all" ? "返回全部图像" : "返回生成归档";
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
      const categoryItems = itemsForScope(definition.id);
      const coverItem = categoryItems.find((item) => item.src === definition.cover) || categoryItems[0];
      if (coverItem) navigateToDetail(coverItem, definition.id);
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
  displayDailyItem(item);
  if (!reduceMotion.matches) {
    elements.dailyImageWrap.classList.remove("is-switching");
    void elements.dailyImageWrap.offsetWidth;
    elements.dailyImageWrap.classList.add("is-switching");
  }
}

function updateCollectionMore() {
  const hasMore = state.collectionRenderedCount < state.allItems.length;
  elements.collectionMore.hidden = !hasMore;
  elements.collectionMore.setAttribute(
    "aria-label",
    `加载更多图像，已显示 ${state.collectionRenderedCount} 张，共 ${state.allItems.length} 张`,
  );
}

export function renderNextCollectionPage() {
  const pageEnd = nextCollectionPageEnd(state.collectionRenderedCount, state.allItems.length);
  const fragment = document.createDocumentFragment();

  state.allItems.slice(state.collectionRenderedCount, pageEnd).forEach((item) => {
    const card = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    card.dataset.category = item.category;
    card.setAttribute("aria-label", `查看 ${item.title}，归档于 ${item.date}`);
    image.loading = "lazy";
    image.decoding = "async";
    image.src = item.src;
    image.alt = `${item.title}，${item.categoryLabel}`;
    card.querySelector("strong").textContent = item.title;
    card.querySelector("small").textContent = item.date;
    card.addEventListener("click", () => navigateToDetail(item, "all"));
    fragment.append(card);
  });

  elements.collectionGrid.append(fragment);
  state.collectionRenderedCount = pageEnd;
  updateCollectionMore();
}

function renderCollection() {
  elements.collectionCount.textContent = `${state.allItems.length} 张图像`;

  if (!state.allItems.length) {
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

function renderDetailStrip() {
  elements.detailStrip.replaceChildren();
  detailThumbnailObserver?.takeRecords();
  detailThumbnailObserver?.disconnect();
  detailThumbnailObserver = null;
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (observer !== detailThumbnailObserver) return;
      entries.forEach((entry) => {
        const image = entry.target;
        if (!entry.isIntersecting || !image.isConnected) return;
        hydrateDetailThumbnail(image);
        observer.unobserve(image);
      });
    }, { root: elements.detailStrip, rootMargin: "200px" });
    detailThumbnailObserver = observer;
  }

  state.activeItems.forEach((item, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.className = "detail-thumb";
    button.type = "button";
    button.role = "option";
    button.setAttribute("aria-label", `查看 ${item.title}`);
    button.setAttribute("aria-selected", "false");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.src = item.src;
    if (Math.abs(index - state.detailIndex) <= 2) {
      hydrateDetailThumbnail(image);
    } else {
      detailThumbnailObserver?.observe(image);
    }
    button.append(image);
    button.addEventListener("focus", () => hydrateDetailThumbnail(image));
    button.addEventListener("pointerenter", () => hydrateDetailThumbnail(image));
    button.addEventListener("click", () => {
      hydrateDetailThumbnail(image);
      selectDetail(index);
    });
    elements.detailStrip.append(button);
  });
  state.renderedStripScope = state.detailScope;
}

function renderDetail() {
  const item = state.activeItems[state.detailIndex];
  if (!item) return;

  if (state.renderedStripScope !== state.detailScope || elements.detailStrip.childElementCount !== state.activeItems.length) {
    renderDetailStrip();
  }

  elements.detailImage.src = item.src;
  elements.detailImage.alt = `${item.title}，${item.categoryLabel}`;
  elements.detailTitle.textContent = item.title;
  elements.detailCounter.textContent = `${String(state.detailIndex + 1).padStart(2, "0")} / ${String(state.activeItems.length).padStart(2, "0")}`;
  elements.detailMeta.textContent = `${item.categoryLabel} · ${item.date}`;
  document.title = "shanzoon.art";

  const thumbnails = [...elements.detailStrip.querySelectorAll(".detail-thumb")];
  thumbnails.forEach((thumbnail, index) => {
    const selected = index === state.detailIndex;
    thumbnail.setAttribute("aria-selected", String(selected));
    thumbnail.tabIndex = selected ? 0 : -1;
  });

  const selectedThumbnail = thumbnails[state.detailIndex];
  hydrateDetailThumbnail(selectedThumbnail?.querySelector("img"));
  requestAnimationFrame(() => {
    selectedThumbnail?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest", inline: "center" });
  });
}

export function navigateHome(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  setPage("home");
  document.title = "shanzoon.art";
  if (updateHash && location.hash !== "#home") history.pushState({ source: previousPage }, "", "#home");
  if (restorePosition) restoreScroll(state.homeScrollY);
  else window.scrollTo({ top: 0, left: 0 });
  scheduleStoryUpdate();
}

export function navigateToArchive(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  if (previousPage === "home") state.homeScrollY = scrollY;
  setPage("collection");
  renderCollection();
  document.title = "shanzoon.art";
  if (updateHash && location.hash !== "#archive") history.pushState({ source: previousPage }, "", "#archive");
  if (restorePosition) restoreScroll(state.archiveScrollY);
  else window.scrollTo({ top: 0, left: 0 });
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
  state.renderedStripScope = "";
  setPage("detail");
  renderDetail();

  if (updateHash) history.pushState({ source: previousPage }, "", detailHash(scope, item));
  window.scrollTo({ top: 0, left: 0 });
}

function selectDetail(index, updateHash = true) {
  if (!state.activeItems.length) return;
  state.detailIndex = (index + state.activeItems.length) % state.activeItems.length;
  renderDetail();
  if (updateHash) {
    const item = state.activeItems[state.detailIndex];
    history.replaceState(history.state, "", detailHash(state.detailScope, item));
  }
}

export function moveDetail(direction) {
  selectDetail(state.detailIndex + direction);
}

export function routeFromHash() {
  if (!state.allItems.length) return;

  if (location.hash === "#archive") {
    navigateToArchive(false, state.page === "detail" && state.detailSource === "collection");
    return;
  }

  const detailMatch = location.hash.match(/^#detail\/([^/]+)\/(.+)$/);
  if (detailMatch) {
    const scope = decodeURIComponent(detailMatch[1]);
    const src = decodeURIComponent(detailMatch[2]);
    const item = state.allItems.find((candidate) => candidate.src === src);
    if (item && itemsForScope(scope).some((candidate) => candidate.src === src)) {
      navigateToDetail(item, scope, false);
      return;
    }
  }

  const legacyMatch = location.hash.match(/^#gallery\/(.+)$/);
  if (legacyMatch) {
    const scope = decodeURIComponent(legacyMatch[1]);
    const definition = categoryFor(scope);
    const categoryItems = itemsForScope(scope);
    const coverItem = categoryItems.find((item) => item.src === definition?.cover) || categoryItems[0];
    if (coverItem) {
      navigateToDetail(coverItem, scope, false);
      return;
    }
  }

  navigateHome(false, state.page === "collection" || (state.page === "detail" && state.detailSource === "home"));
}
