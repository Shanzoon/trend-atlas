import { elements } from "./elements.js";
import { invalidateMotionLayout, scheduleStoryUpdate } from "./home.js";
import { mobileLayout, reduceMotion } from "./media.js";
import { state } from "./state.js";
import { hydrateFolderCovers, moveDetail, navigateHome, navigateToArchive, renderDailyItem, renderNextCollectionPage, routeFromHash, switchDailyItem } from "./views.js";

document.documentElement.classList.add("motion-ready");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function leaveDetail() {
  if (history.state?.source) history.back();
  else if (state.detailScope === "all") navigateToArchive();
  else navigateHome(true, true);
}

elements.archiveAll.addEventListener("click", () => navigateToArchive());
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
  hydrateFolderCovers();
  try {
    const response = await fetch("/archive.json");
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
