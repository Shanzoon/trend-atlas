import { elements } from "./elements.js?v=20260902-archivehardening1";
import { createArchiveLoader, scheduleDelayedArchiveFeedback } from "./archive.js?v=20260902-archivehardening1";
import { invalidateMotionLayout, jumpToHomeScene, scheduleStoryUpdate } from "./home.js?v=20260902-archivehardening1";
import { mobileLayout, reduceMotion } from "./media.js?v=20260902-archivehardening1";
import { applySiteConfig, siteConfig } from "./site.js?v=20260902-archivehardening1";
import { state } from "./state.js?v=20260902-archivehardening1";
import { hydrateFolderCovers, initCollectionFilters, moveDetail, navigateHome, navigateToArchive, renderNextCollectionPage, retryDetailImage, routeFromHash, switchDailyItem } from "./views.js?v=20260902-archivehardening1";

let configurationError;
try {
  applySiteConfig();
} catch (error) {
  configurationError = error;
  elements.homeStatus.textContent = `站点配置错误：${error.message}`;
  elements.homeStatus.classList.add("is-error");
}

document.documentElement.classList.add("motion-ready");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

let archiveLoadPromise = null;
let loadArchiveManifest;
let cancelArchiveLoadingFeedback = () => {};

function setArchiveLoadState(loadState, showDelayedLoading = false) {
  const moveRetryFocus = loadState === "loading"
    && (document.activeElement === elements.archiveAll || document.activeElement === elements.quickIndexArchive);
  state.archiveLoadState = loadState;
  state.archiveReady = loadState === "ready";

  const retryAvailable = loadState === "error";
  const archiveAvailable = loadState === "ready" || retryAvailable;
  const showingLoading = loadState === "loading" && showDelayedLoading;
  elements.archiveAll.textContent = retryAvailable
    ? "RETRY ARCHIVE"
    : showingLoading ? "LOADING ARCHIVE…" : "VIEW ALL";
  elements.quickIndexArchive.textContent = retryAvailable
    ? "RETRY ARCHIVE"
    : showingLoading ? "ARCHIVE · LOADING" : "ARCHIVE";
  elements.archiveStatus.textContent = retryAvailable
    ? "归档暂时没有打开。你可以重试，其他内容仍可继续浏览。"
    : showingLoading ? "正在连接图像归档…" : "";
  elements.archiveStatus.classList.toggle("is-error", retryAvailable);
  elements.archiveStatus.classList.toggle("is-visible", retryAvailable || showingLoading);
  elements.archiveAll.setAttribute("aria-busy", String(loadState === "loading"));
  elements.quickIndexArchive.setAttribute("aria-busy", String(loadState === "loading"));
  if (archiveAvailable) elements.quickIndexArchive.removeAttribute("aria-disabled");
  else elements.quickIndexArchive.setAttribute("aria-disabled", "true");
  elements.quickIndexArchive.tabIndex = archiveAvailable ? 0 : -1;
  if (moveRetryFocus) elements.archiveStatus.focus({ preventScroll: true });
  invalidateMotionLayout();
}

function loadArchive() {
  if (!loadArchiveManifest) return Promise.resolve();
  if (archiveLoadPromise) return archiveLoadPromise;

  setArchiveLoadState("loading");
  cancelArchiveLoadingFeedback();
  cancelArchiveLoadingFeedback = scheduleDelayedArchiveFeedback(() => {
    setArchiveLoadState("loading", true);
  });

  archiveLoadPromise = (async () => {
    try {
      const { days, items } = await loadArchiveManifest();
      state.days = days;
      state.allItems = items;
      cancelArchiveLoadingFeedback();
      setArchiveLoadState("ready");
      routeFromHash();
    } catch (error) {
      cancelArchiveLoadingFeedback();
      setArchiveLoadState("error");
      console.error("Archive manifest failed to load", error);
    } finally {
      archiveLoadPromise = null;
    }
  })();

  return archiveLoadPromise;
}

function leaveDetail() {
  if (history.state?.source) history.back();
  else if (state.detailScope === "all") navigateToArchive("all");
  else navigateHome(true, true);
}

elements.archiveAll.addEventListener("click", () => {
  if (state.archiveLoadState === "error") loadArchive();
  else if (state.archiveReady) navigateToArchive("all");
});
elements.quickIndexArchive.addEventListener("click", (event) => {
  event.preventDefault();
  if (state.archiveLoadState === "error") loadArchive();
  else if (state.archiveReady) navigateToArchive("all");
});
elements.quickIndexProducts.addEventListener("click", (event) => {
  event.preventDefault();
  jumpToHomeScene("products");
});
elements.quickIndexContact.addEventListener("click", (event) => {
  event.preventDefault();
  jumpToHomeScene("contact");
});
elements.collectionMore.addEventListener("click", renderNextCollectionPage);
elements.galleryBack.addEventListener("click", () => {
  if (state.page === "collection") {
    if (history.state?.source === "home") history.back();
    else navigateHome(true, true);
    return;
  }
  leaveDetail();
});
elements.homeLink.addEventListener("click", (event) => {
  event.preventDefault();
  navigateHome();
});
elements.dailyImageWrap.addEventListener("click", switchDailyItem);
elements.dailyImageWrap.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    switchDailyItem();
  }
});
elements.dailyRefresh.addEventListener("click", switchDailyItem);
elements.detailPrevious.addEventListener("click", () => moveDetail(-1));
elements.detailNext.addEventListener("click", () => moveDetail(1));
elements.detailRetry.addEventListener("click", retryDetailImage);

elements.detailMedia.addEventListener("pointermove", (event) => {
  if (reduceMotion.matches) return;
  const rect = elements.detailMedia.getBoundingClientRect();
  elements.detailImageWrap.style.setProperty("--detail-ry", `${((event.clientX - rect.left) / rect.width - 0.5) * 3}deg`);
  elements.detailImageWrap.style.setProperty("--detail-rx", `${(0.5 - (event.clientY - rect.top) / rect.height) * 3}deg`);
});
elements.detailMedia.addEventListener("pointerleave", () => {
  elements.detailImageWrap.style.setProperty("--detail-rx", "0deg");
  elements.detailImageWrap.style.setProperty("--detail-ry", "0deg");
});

document.addEventListener("keydown", (event) => {
  if (state.page !== "detail" || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "Escape") {
    leaveDetail();
    return;
  }
  if (event.key === "ArrowLeft") moveDetail(-1);
  if (event.key === "ArrowRight") moveDetail(1);
});
window.addEventListener("scroll", scheduleStoryUpdate, { passive: true });
window.addEventListener("resize", invalidateMotionLayout);
window.addEventListener("popstate", routeFromHash);
reduceMotion.addEventListener("change", invalidateMotionLayout);
mobileLayout.addEventListener("change", invalidateMotionLayout);

async function initialize() {
  if (configurationError) return;
  hydrateFolderCovers();
  initCollectionFilters();
  loadArchiveManifest = createArchiveLoader({ path: siteConfig.archive.manifestPath });
  await loadArchive();
}

scheduleStoryUpdate();
initialize();
