import { categoryDefinitions, categoryFor } from "./categories.js";

const elements = {
  story: document.querySelector("#brandStory"),
  stage: document.querySelector("#brightStage"),
  identity: document.querySelector("#stageIdentity"),
  archiveCopy: document.querySelector("#archiveCopy"),
  archiveAll: document.querySelector("#archiveAll"),
  dailyArt: document.querySelector("#dailyArt"),
  dailyImage: document.querySelector("#dailyImage"),
  portals: document.querySelector("#folderPortals"),
  portalButtons: [...document.querySelectorAll(".folder-portal")],
  scrollCue: document.querySelector("#scrollCue"),
  archiveScrollCue: document.querySelector("#archiveScrollCue"),
  homeStatus: document.querySelector("#homeStatus"),
  homeContinuation: document.querySelector("#homeContinuation"),
  systemsStory: document.querySelector("#systemsStory"),
  systemsBridge: document.querySelector("#systemsBridge"),
  projectSheets: [...document.querySelectorAll("[data-project-sheet]")],
  projectTitles: [...document.querySelectorAll(".project-title")],
  projectCopies: [...document.querySelectorAll(".project-sheet-copy")],
  projectLinks: [...document.querySelectorAll("[data-project-link]")],
  systemsContact: document.querySelector("#systemsContact"),
  systemsContactLinks: [...document.querySelectorAll("#systemsContact a")],
  homeLink: document.querySelector("#homeLink"),
  collectionPage: document.querySelector("#collectionPage"),
  collectionCount: document.querySelector("#collectionCount"),
  collectionGrid: document.querySelector("#collectionGrid"),
  galleryBack: document.querySelector("#galleryBack"),
  galleryBackLabel: document.querySelector("#galleryBackLabel"),
  itemTemplate: document.querySelector("#collectionItemTemplate"),
  detailPage: document.querySelector("#detailPage"),
  detailImage: document.querySelector("#detailImage"),
  detailTitle: document.querySelector("#detailTitle"),
  detailCounter: document.querySelector("#detailCounter"),
  detailMeta: document.querySelector("#detailMeta"),
  detailImageWrap: document.querySelector("#detailImageWrap"),
  detailStrip: document.querySelector("#detailStrip"),
  detailPrevious: document.querySelector("#detailPrevious"),
  detailNext: document.querySelector("#detailNext"),
};

const state = {
  days: [],
  allItems: [],
  activeItems: [],
  dailyItem: null,
  detailIndex: 0,
  detailScope: "all",
  detailSource: "home",
  renderedStripScope: "",
  page: "home",
  homeScrollY: 0,
  archiveScrollY: 0,
  animationFrame: 0,
  folderPreviewsHydrated: false,
  motionMetrics: null,
  staticMotionApplied: false,
};

const archiveTimeline = {
  gather: [0.06, 0.44],
  folders: [0.32, 0.62],
  handoff: [0.84, 0.98],
  identityExit: [0.16, 0.34],
  archiveEntry: [0.34, 0.52],
  archiveExit: [0.86, 0.98],
  artExit: [0.14, 0.46],
  folderExit: [0.94, 1],
  allEntry: [0.48, 0.62],
  cueEntry: [0.72, 0.84],
  bridgeHandoff: [0.94, 1],
};

const systemsTimeline = {
  bridgeEntry: [0, 0.08],
  projectStarts: [0.08, 0.4, 0.68],
  contactEntry: [0.86, 0.93],
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobileLayout = matchMedia("(max-width: 760px)");
document.documentElement.classList.add("motion-ready");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(start, end, value) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function clearMotionStyles(element) {
  element.removeAttribute("style");
}

function setButtonInteractive(button, enabled) {
  if (!enabled && document.activeElement === button) elements.homeLink.focus({ preventScroll: true });
  if (button.disabled !== !enabled) button.disabled = !enabled;
  if (button.tabIndex !== (enabled ? 0 : -1)) button.tabIndex = enabled ? 0 : -1;
}

function setContainerInteractive(element, enabled) {
  if (!enabled && element.contains(document.activeElement)) elements.homeLink.focus({ preventScroll: true });
  if (element.hasAttribute("inert") === enabled) element.toggleAttribute("inert", !enabled);
  const pointerEvents = enabled ? "auto" : "none";
  if (element.style.pointerEvents !== pointerEvents) element.style.pointerEvents = pointerEvents;
}

function measureMotionLayout() {
  const storyTop = elements.story.offsetTop;
  const systemsTop = elements.systemsStory.getBoundingClientRect().top + scrollY;
  return {
    storyTop,
    storyDistance: Math.max(1, elements.story.offsetHeight - innerHeight),
    systemsTop,
    systemsDistance: Math.max(1, elements.systemsStory.offsetHeight - innerHeight),
    portalsWidth: elements.portals.clientWidth,
    portalOffsets: elements.portalButtons.map((button) => button.offsetLeft),
  };
}

function stableDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectDailyItem() {
  if (!state.allItems.length) return null;
  return state.allItems[hashString(stableDateKey()) % state.allItems.length];
}

function itemsForScope(scope) {
  if (scope === "all") return state.allItems;
  return state.allItems.filter((item) => item.category === scope);
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

function hydrateFolderCovers() {
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

function hydrateFolderPreviews() {
  if (state.folderPreviewsHydrated) return;
  state.folderPreviewsHydrated = true;
  elements.portalButtons.forEach((button) => {
    const definition = categoryFor(button.dataset.category);
    const categoryItems = itemsForScope(definition.id);
    const previewItems = categoryItems.filter((item) => item.src !== definition.cover).slice(0, 2);

    button.querySelectorAll(".is-preview-extra").forEach((layer) => layer.remove());
    button.classList.toggle("has-preview-stack", previewItems.length === 2);

    previewItems.forEach((item, index) => {
      const layer = document.createElement("span");
      const image = document.createElement("img");
      layer.className = `folder-image is-preview-extra ${index === 0 ? "is-preview-left" : "is-preview-right"}`;
      image.src = item.src;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      layer.append(image);
      button.querySelector(".folder-front").before(layer);
    });
  });
}

function renderDailyItem() {
  state.dailyItem = selectDailyItem();
  if (!state.dailyItem) {
    elements.dailyArt.hidden = true;
    elements.homeStatus.textContent = "今天暂时没有可用图像";
    elements.homeStatus.classList.add("is-error");
    return;
  }

  elements.dailyArt.hidden = false;
  elements.dailyImage.src = state.dailyItem.src;
  elements.dailyImage.alt = `${state.dailyItem.title}，${state.dailyItem.categoryLabel}`;
  elements.homeStatus.textContent = "";
  elements.homeStatus.classList.remove("is-error");
}

function renderCollection() {
  elements.collectionCount.textContent = `${state.allItems.length} 张图像`;
  elements.collectionGrid.replaceChildren();

  if (!state.allItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-collection";
    empty.textContent = "归档中暂时还没有图像。";
    elements.collectionGrid.append(empty);
    return;
  }

  state.allItems.forEach((item) => {
    const card = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    card.dataset.category = item.category;
    card.setAttribute("aria-label", `查看 ${item.title}，归档于 ${item.date}`);
    image.src = item.src;
    image.alt = `${item.title}，${item.categoryLabel}`;
    card.querySelector("strong").textContent = item.title;
    card.querySelector("small").textContent = item.date;
    card.addEventListener("click", () => navigateToDetail(item, "all"));
    elements.collectionGrid.append(card);
  });
}

function renderDetailStrip() {
  elements.detailStrip.replaceChildren();
  state.activeItems.forEach((item, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.className = "detail-thumb";
    button.type = "button";
    button.role = "option";
    button.setAttribute("aria-label", `查看 ${item.title}`);
    button.setAttribute("aria-selected", "false");
    image.src = item.src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    button.append(image);
    button.addEventListener("click", () => selectDetail(index));
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
  document.title = `${item.title} · shanzoon.art`;

  const thumbnails = [...elements.detailStrip.querySelectorAll(".detail-thumb")];
  thumbnails.forEach((thumbnail, index) => {
    const selected = index === state.detailIndex;
    thumbnail.setAttribute("aria-selected", String(selected));
    thumbnail.tabIndex = selected ? 0 : -1;
  });

  const selectedThumbnail = thumbnails[state.detailIndex];
  requestAnimationFrame(() => {
    selectedThumbnail?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest", inline: "center" });
  });
}

function navigateHome(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  setPage("home");
  document.title = "shanzoon.art";
  if (updateHash && location.hash !== "#home") history.pushState({ source: previousPage }, "", "#home");
  if (restorePosition) restoreScroll(state.homeScrollY);
  else window.scrollTo({ top: 0, left: 0 });
  scheduleStoryUpdate();
}

function navigateToArchive(updateHash = true, restorePosition = false) {
  const previousPage = state.page;
  if (previousPage === "home") state.homeScrollY = scrollY;
  setPage("collection");
  renderCollection();
  document.title = "All Images · shanzoon.art";
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

function moveDetail(direction) {
  selectDetail(state.detailIndex + direction);
}

function routeFromHash() {
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

function updateSystemsStory(staticStory, metrics, brandProgress = 0) {
  if (staticStory) {
    clearMotionStyles(elements.systemsBridge);
    elements.projectSheets.forEach((sheet) => {
      clearMotionStyles(sheet);
      sheet.removeAttribute("inert");
    });
    elements.projectTitles.forEach(clearMotionStyles);
    elements.projectCopies.forEach((copy) => {
      clearMotionStyles(copy);
      copy.removeAttribute("inert");
    });
    elements.projectLinks.forEach((link) => { link.tabIndex = 0; });
    clearMotionStyles(elements.systemsContact);
    elements.systemsContact.removeAttribute("inert");
    elements.systemsContactLinks.forEach((link) => { link.tabIndex = 0; });
    return;
  }

  const progress = clamp((scrollY - metrics.systemsTop) / metrics.systemsDistance);
  // Establish the chapter title during the hand-off, then let the first board
  // arrive after the visitor has registered the new section.
  const bridgeEntry = Math.max(
    smoothstep(...systemsTimeline.bridgeEntry, progress),
    smoothstep(...archiveTimeline.bridgeHandoff, brandProgress),
  );
  elements.systemsBridge.style.opacity = bridgeEntry.toFixed(3);
  elements.systemsBridge.style.filter = `blur(${lerp(5, 0, bridgeEntry).toFixed(2)}px)`;
  elements.systemsBridge.style.transform = `translateX(-50%) translateY(${lerp(18, 0, bridgeEntry).toFixed(1)}px)`;

  const starts = systemsTimeline.projectStarts;
  elements.projectSheets.forEach((sheet, index) => {
    const entryDuration = index === 0 ? 0.18 : 0.12;
    const entry = smoothstep(starts[index], starts[index] + entryDuration, progress);
    const firstCover = index < starts.length - 1 ? smoothstep(starts[index + 1], starts[index + 1] + 0.12, progress) : 0;
    const secondCover = index < starts.length - 2 ? smoothstep(starts[index + 2], starts[index + 2] + 0.12, progress) : 0;
    const direction = index % 2 === 0 ? -1 : 1;
    const entryX = index === 0 ? 0 : 118;
    const x = lerp(entryX, 0, entry) + direction * (54 * firstCover + 28 * secondCover);
    const y = lerp(index === 0 ? 160 : 112, 0, entry) - 18 * firstCover - 14 * secondCover;
    const scale = lerp(0.91, 1, entry) - 0.05 * firstCover - 0.035 * secondCover;
    const rotation = lerp(3.2, 0, entry) + direction * (2.1 * firstCover + 0.8 * secondCover);
    const opacity = entry * (1 - 0.55 * firstCover - 0.25 * secondCover);
    sheet.style.zIndex = String(index + 2);
    sheet.style.opacity = opacity.toFixed(3);
    sheet.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)}) rotate(${rotation.toFixed(2)}deg)`;
    const active = entry > 0.9 && firstCover < 0.15;
    setContainerInteractive(sheet, active);

    const titleEntry = smoothstep(starts[index] + 0.06, starts[index] + 0.12, progress);
    const titleExit = index < starts.length - 1
      ? smoothstep(starts[index + 1], starts[index + 1] + 0.06, progress)
      : 0;
    const titleOpacity = titleEntry * (1 - titleExit);
    elements.projectTitles[index].style.opacity = titleOpacity.toFixed(3);
    elements.projectTitles[index].style.transform = `translateY(${lerp(10, 0, titleEntry).toFixed(1)}px)`;

    const copyEntry = index === 0
      ? smoothstep(starts[index] + 0.11, starts[index] + 0.22, progress)
      : smoothstep(starts[index] + 0.12, starts[index] + 0.21, progress);
    const copyOpacity = copyEntry * (1 - firstCover);
    const copyInteractive = active && copyOpacity > 0.2;
    elements.projectCopies[index].style.opacity = copyOpacity.toFixed(3);
    setContainerInteractive(elements.projectCopies[index], copyInteractive);
    elements.projectCopies[index].style.transform = `translateY(${lerp(12, 0, copyOpacity).toFixed(1)}px)`;
    if (elements.projectLinks[index]) elements.projectLinks[index].tabIndex = copyInteractive ? 0 : -1;
  });

  const contactEntry = smoothstep(...systemsTimeline.contactEntry, progress);
  const contactIsInteractive = contactEntry > 0.9;
  elements.systemsContact.style.opacity = contactEntry.toFixed(3);
  setContainerInteractive(elements.systemsContact, contactIsInteractive);
  elements.systemsContact.style.transform = `translateY(${lerp(14, 0, contactEntry).toFixed(1)}px)`;
  elements.systemsContactLinks.forEach((link) => { link.tabIndex = contactIsInteractive ? 0 : -1; });
}

function updateStory() {
  state.animationFrame = 0;
  if (state.page !== "home") return;

  const staticStory = mobileLayout.matches || reduceMotion.matches;

  if (staticStory) {
    if (!state.folderPreviewsHydrated && scrollY - elements.story.offsetTop > innerHeight * 0.42) hydrateFolderPreviews();
    if (state.staticMotionApplied) return;
    updateSystemsStory(true);
    elements.stage.style.setProperty("--stage-scale", "1");
    elements.portalButtons.forEach((button) => setButtonInteractive(button, true));
    elements.portals.classList.add("is-ready");
    setButtonInteractive(elements.archiveAll, true);
    elements.archiveAll.classList.add("is-ready");
    state.staticMotionApplied = true;
    return;
  }

  state.staticMotionApplied = false;
  const metrics = state.motionMetrics || (state.motionMetrics = measureMotionLayout());
  const progress = clamp((scrollY - metrics.storyTop) / metrics.storyDistance);
  updateSystemsStory(false, metrics, progress);
  if (progress > 0.24) hydrateFolderPreviews();

  const gather = smoothstep(...archiveTimeline.gather, progress);
  const folders = smoothstep(...archiveTimeline.folders, progress);
  const handoff = smoothstep(...archiveTimeline.handoff, progress);

  elements.stage.style.setProperty("--stage-scale", lerp(1, 0.84, gather).toFixed(4));
  elements.identity.style.left = `${lerp(7, 25, gather)}%`;
  elements.identity.style.top = `${lerp(50, 17, gather)}%`;
  elements.identity.style.width = `${lerp(38, 50, gather)}%`;

  const identityExit = smoothstep(...archiveTimeline.identityExit, progress);
  const archiveEntry = smoothstep(...archiveTimeline.archiveEntry, progress);
  elements.identity.style.opacity = (1 - identityExit).toFixed(3);
  elements.identity.style.filter = `blur(${lerp(0, 5, identityExit).toFixed(2)}px)`;
  elements.identity.style.transform = `translateY(-50%) translateY(${lerp(0, -10, identityExit).toFixed(1)}px) scale(${lerp(1, 0.97, identityExit).toFixed(3)})`;
  const archiveExit = smoothstep(...archiveTimeline.archiveExit, progress);
  elements.archiveCopy.style.opacity = (archiveEntry * (1 - archiveExit)).toFixed(3);
  elements.archiveCopy.style.filter = `blur(${(lerp(5, 0, archiveEntry) + lerp(0, 4, archiveExit)).toFixed(2)}px)`;
  elements.archiveCopy.style.transform = `translateX(-50%) translateY(${(lerp(12, 0, archiveEntry) - 34 * archiveExit).toFixed(1)}px)`;

  const artOpacity = 1 - smoothstep(...archiveTimeline.artExit, progress);
  elements.dailyArt.style.opacity = artOpacity.toFixed(3);
  elements.dailyArt.style.transform = `translateY(-50%) scale(${lerp(1, 0.72, 1 - artOpacity).toFixed(3)})`;
  elements.scrollCue.style.opacity = (1 - smoothstep(0, 0.16, progress)).toFixed(3);

  const rotations = [-11, -4, 6, 12];
  const gatheredOffsets = [-0.16, -0.055, 0.065, 0.17];
  elements.portalButtons.forEach((button, index) => {
    const local = smoothstep(0.08 * index, 0.6 + 0.07 * index, folders);
    const gatheredCenter = metrics.portalsWidth * (0.5 + gatheredOffsets[index]);
    const gatherX = (gatheredCenter - metrics.portalOffsets[index]) * handoff;
    const gatherY = lerp(0, -52, handoff);
    const folderScale = lerp(1, 0.78, handoff);
    const folderRotation = rotations[index] * lerp(1, 0.55, handoff);
    button.style.opacity = local.toFixed(3);
    button.style.transform = `translate(-50%, -50%) translate(${gatherX.toFixed(1)}px, ${(lerp(120, 0, local) + gatherY).toFixed(1)}px) scale(${(lerp(0.72, 1, local) * folderScale).toFixed(3)}) rotate(${folderRotation.toFixed(2)}deg)`;
    setButtonInteractive(button, folders > 0.72 && handoff < 0.18);
  });
  const folderExit = smoothstep(...archiveTimeline.folderExit, progress);
  elements.portals.style.opacity = (folders * (1 - folderExit)).toFixed(3);
  elements.portals.classList.toggle("is-ready", folders > 0.72 && handoff < 0.18);

  const allEntry = smoothstep(...archiveTimeline.allEntry, progress);
  elements.archiveAll.style.opacity = (allEntry * (1 - archiveExit)).toFixed(3);
  elements.archiveAll.style.transform = `translateY(${(lerp(12, 0, allEntry) - 20 * archiveExit).toFixed(1)}px)`;
  elements.archiveScrollCue.style.opacity = (smoothstep(...archiveTimeline.cueEntry, progress) * (1 - handoff)).toFixed(3);
  const archiveIsInteractive = allEntry > 0.82 && handoff < 0.18;
  setButtonInteractive(elements.archiveAll, archiveIsInteractive);
  elements.archiveAll.classList.toggle("is-ready", archiveIsInteractive);
}

function scheduleStoryUpdate() {
  if (state.animationFrame) return;
  state.animationFrame = requestAnimationFrame(updateStory);
}

function invalidateMotionLayout() {
  state.motionMetrics = null;
  state.staticMotionApplied = false;
  scheduleStoryUpdate();
}

elements.archiveAll.addEventListener("click", () => navigateToArchive());
elements.galleryBack.addEventListener("click", () => {
  if (state.page === "collection") {
    if (history.state?.source === "home") history.back();
    else navigateHome(true, true);
    return;
  }
  if (history.state?.source) history.back();
  else if (state.detailScope === "all") navigateToArchive();
  else navigateHome(true, true);
});
document.querySelector("#homeLink").addEventListener("click", (event) => {
  event.preventDefault();
  navigateHome();
});
elements.detailPrevious.addEventListener("click", () => moveDetail(-1));
elements.detailNext.addEventListener("click", () => moveDetail(1));

elements.detailImageWrap.addEventListener("pointermove", (event) => {
  if (reduceMotion.matches) return;
  const rect = elements.detailImageWrap.getBoundingClientRect();
  elements.detailImageWrap.style.setProperty("--detail-ry", `${((event.clientX - rect.left) / rect.width - 0.5) * 3}deg`);
  elements.detailImageWrap.style.setProperty("--detail-rx", `${(0.5 - (event.clientY - rect.top) / rect.height) * 3}deg`);
});
elements.detailImageWrap.addEventListener("pointerleave", () => {
  elements.detailImageWrap.style.setProperty("--detail-rx", "0deg");
  elements.detailImageWrap.style.setProperty("--detail-ry", "0deg");
});

document.addEventListener("keydown", (event) => {
  if (state.page !== "detail" || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowLeft") moveDetail(-1);
  if (event.key === "ArrowRight") moveDetail(1);
});
window.addEventListener("scroll", scheduleStoryUpdate, { passive: true });
window.addEventListener("resize", invalidateMotionLayout);
window.addEventListener("popstate", routeFromHash);
reduceMotion.addEventListener("change", invalidateMotionLayout);
mobileLayout.addEventListener("change", invalidateMotionLayout);

async function initialize() {
  hydrateFolderCovers();
  try {
    const response = await fetch("/api/archive");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.days = data.days;
    state.allItems = data.days
      .flatMap((day) => day.items.map((item) => ({ ...item, date: day.date })))
      .sort((first, second) => second.date.localeCompare(first.date) || first.title.localeCompare(second.title, "zh-CN"));
    if (!state.allItems.length) throw new Error("归档中没有图片");
    renderDailyItem();
    routeFromHash();
  } catch (error) {
    elements.homeStatus.textContent = `图像归档读取失败：${error.message}`;
    elements.homeStatus.classList.add("is-error");
  }
}

scheduleStoryUpdate();
initialize();
