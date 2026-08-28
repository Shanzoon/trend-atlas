import { categoryFor } from "./categories.js?v=20260829-template-thumbhash1";
import { elements } from "./elements.js?v=20260829-template-thumbhash1";
import { mobileLayout, reduceMotion } from "./media.js?v=20260829-template-thumbhash1";
import { itemsForScope, state } from "./state.js?v=20260829-template-thumbhash1";
import { archiveTimeline, progressWithHold, progressWithHolds, scrollCueOpacity, systemsTimeline } from "./timelines.js?v=20260829-template-thumbhash1";
import { clamp, clearMotionStyles, lerp, setButtonInteractive, setContainerInteractive, smoothstep } from "./utils.js?v=20260829-template-thumbhash1";

const ARCHIVE_STAGE_SCALE = 0.84;

function measureMotionLayout() {
  const storyTop = elements.story.offsetTop;
  const systemsTop = elements.systemsStory.getBoundingClientRect().top + scrollY;
  const storyDistance = Math.max(1, elements.story.offsetHeight - innerHeight);
  const holdDistance = innerHeight * 0.35;
  const systemsHoldDistances = [
    [0.30, innerHeight * 0.30],
    [0.61, innerHeight * 0.30],
    [0.89, innerHeight * 0.20],
  ];
  const systemsHoldDistance = systemsHoldDistances.reduce((total, [, distance]) => total + distance, 0);
  const archiveAnchorY = elements.stage.offsetTop
    + elements.stage.offsetHeight * (1 - ARCHIVE_STAGE_SCALE) / 2
    + elements.archiveCopy.offsetTop * ARCHIVE_STAGE_SCALE;
  return {
    storyTop,
    storyDistance,
    motionDistance: Math.max(1, storyDistance - holdDistance),
    holdDistance,
    systemsTop,
    systemsMotionDistance: Math.max(1, elements.systemsStory.offsetHeight - innerHeight - systemsHoldDistance),
    systemsHoldDistances,
    archiveTitleAnchorY: archiveAnchorY,
    portalsWidth: elements.portals.clientWidth,
    portalOffsets: elements.portalButtons.map((button) => button.offsetLeft),
  };
}

function hydrateFolderPreviews() {
  if (!state.archiveReady || state.folderPreviewsHydrated) return;
  state.folderPreviewsHydrated = true;
  elements.portalButtons.forEach((button) => {
    const definition = categoryFor(button.dataset.category);
    const categoryItems = itemsForScope(definition.id);
    const previewItems = categoryItems.filter((item) => item.src !== definition.cover).slice(0, 2);
    const mainImage = button.querySelector(".is-preview-main img");

    if (mainImage && !mainImage.getAttribute("src")) {
      mainImage.loading = "eager";
      mainImage.decoding = "async";
      mainImage.fetchPriority = "low";
      mainImage.addEventListener("error", () => {
        elements.homeStatus.textContent = `分类封面加载失败：${definition.label}。请检查 site.config.js 中的 archive.categories。`;
        elements.homeStatus.classList.add("is-error");
      }, { once: true });
      mainImage.src = definition.preview;
    }

    if (previewItems.length !== 2) return;
    button.classList.add("has-preview-stack");
    let previewTimer = 0;
    const loadHoverPreviews = () => {
      previewTimer = 0;
      if (button.querySelector(".is-preview-extra")) return;
      previewItems.forEach((item, index) => {
        const layer = document.createElement("span");
        const image = document.createElement("img");
        layer.className = `folder-image is-preview-extra ${index === 0 ? "is-preview-left" : "is-preview-right"}`;
        image.src = item.src;
        image.alt = "";
        image.decoding = "async";
        image.fetchPriority = "low";
        layer.append(image);
        button.querySelector(".folder-front").before(layer);
      });
    };
    const scheduleHoverPreviews = () => {
      if (previewTimer || button.querySelector(".is-preview-extra")) return;
      previewTimer = window.setTimeout(loadHoverPreviews, 240);
    };
    const cancelHoverPreviews = () => {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = 0;
      }
      button.querySelectorAll(".is-preview-extra").forEach((layer) => {
        layer.querySelector("img")?.removeAttribute("src");
        layer.remove();
      });
    };
    button.addEventListener("pointerenter", scheduleHoverPreviews);
    button.addEventListener("pointerleave", cancelHoverPreviews);
    button.addEventListener("pointerdown", cancelHoverPreviews);
    button.addEventListener("click", cancelHoverPreviews);
  });
}

function updateSystemsStory(staticStory, metrics, titleProgress = 0, handoffY = 0) {
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

  const progress = progressWithHolds(
    scrollY - metrics.systemsTop,
    metrics.systemsMotionDistance,
    metrics.systemsHoldDistances,
  );
  // Establish the chapter title during the hand-off. The first board gets a
  // quiet visual preview near the end so the new scene never reads as empty.
  const bridgeEntry = Math.max(
    smoothstep(...systemsTimeline.bridgeEntry, progress),
    titleProgress,
  );
  const systemsDeck = elements.systemsBridge.offsetParent;
  const deckTop = Math.max(0, systemsDeck ? systemsDeck.getBoundingClientRect().top : 0);
  elements.systemsBridge.style.opacity = bridgeEntry.toFixed(3);
  elements.systemsBridge.style.filter = `blur(${lerp(5, 0, bridgeEntry).toFixed(2)}px)`;
  elements.systemsBridge.style.transform = `translateX(-50%) translateY(${(handoffY - deckTop - elements.systemsBridge.offsetTop).toFixed(1)}px)`;

  const starts = systemsTimeline.projectStarts;
  elements.projectSheets.forEach((sheet, index) => {
    const entryDuration = 0.12;
    const timelineEntry = smoothstep(starts[index], starts[index] + entryDuration, progress);
    const handoffPreview = index === 0 ? 0.22 * smoothstep(0.66, 1, titleProgress) : 0;
    const entry = Math.max(timelineEntry, handoffPreview);
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
    elements.portalButtons.forEach((button) => setButtonInteractive(button, state.archiveReady));
    elements.portals.classList.toggle("is-ready", state.archiveReady);
    setButtonInteractive(elements.archiveAll, state.archiveReady);
    elements.archiveAll.classList.toggle("is-ready", state.archiveReady);
    state.staticMotionApplied = true;
    return;
  }

  state.staticMotionApplied = false;
  const metrics = state.motionMetrics || (state.motionMetrics = measureMotionLayout());
  const progress = progressWithHold(
    scrollY - metrics.storyTop,
    metrics.motionDistance,
    archiveTimeline.handoff[0],
    metrics.holdDistance,
  );
  const titleProgress = smoothstep(...archiveTimeline.titleHandoff, progress);
  const bridgeFinalViewportY = elements.systemsBridge.offsetTop;
  const handoffY = lerp(metrics.archiveTitleAnchorY, bridgeFinalViewportY, titleProgress);
  updateSystemsStory(false, metrics, titleProgress, handoffY);
  if (state.archiveReady && progress > 0.24) hydrateFolderPreviews();

  const gather = smoothstep(...archiveTimeline.gather, progress);
  const folders = smoothstep(...archiveTimeline.folders, progress);
  const handoff = smoothstep(...archiveTimeline.handoff, progress);

  elements.stage.style.setProperty("--stage-scale", lerp(1, ARCHIVE_STAGE_SCALE, gather).toFixed(4));
  elements.identity.style.left = `${lerp(7, 25, gather)}%`;
  elements.identity.style.top = `${lerp(50, 17, gather)}%`;
  elements.identity.style.width = `${lerp(38, 50, gather)}%`;

  const identityExit = smoothstep(...archiveTimeline.identityExit, progress);
  const archiveEntry = smoothstep(...archiveTimeline.archiveEntry, progress);
  elements.identity.style.opacity = (1 - identityExit).toFixed(3);
  elements.identity.style.filter = `blur(${lerp(0, 5, identityExit).toFixed(2)}px)`;
  elements.identity.style.transform = `translateY(-50%) translateY(${lerp(0, -10, identityExit).toFixed(1)}px) scale(${lerp(1, 0.97, identityExit).toFixed(3)})`;
  const archiveExit = titleProgress;
  elements.archiveCopy.style.opacity = (archiveEntry * (1 - archiveExit)).toFixed(3);
  elements.archiveCopy.style.filter = `blur(${(lerp(5, 0, archiveEntry) + lerp(0, 4, archiveExit)).toFixed(2)}px)`;
  const archiveEntryY = lerp(12, 0, archiveEntry);
  const archiveHandoffY = (handoffY - metrics.archiveTitleAnchorY) / ARCHIVE_STAGE_SCALE;
  elements.archiveCopy.style.transform = `translateX(-50%) translateY(${(archiveEntryY + archiveHandoffY).toFixed(1)}px)`;

  const artOpacity = 1 - smoothstep(...archiveTimeline.artExit, progress);
  elements.dailyArt.style.opacity = artOpacity.toFixed(3);
  elements.dailyArt.style.transform = `translateY(-50%) scale(${lerp(1, 0.72, 1 - artOpacity).toFixed(3)})`;
  const rotations = [-11, -4, 6, 12];
  const gatheredOffsets = [-0.16, -0.055, 0.065, 0.17];
  const folderExit = smoothstep(...archiveTimeline.folderExit, progress);
  const folderOpacity = folders * (1 - folderExit);
  // 交互窗口比视觉淡出更宽：淡出到 0.92 之后才允许关闭点击，避免"看得见但点不动"。
  const interactiveExit = smoothstep(0.92, 1, progress);
  const interactiveOpacity = folders * (1 - interactiveExit);
  let foldersAreInteractive = false;
  elements.portalButtons.forEach((button, index) => {
    const local = smoothstep(0.08 * index, 0.6 + 0.07 * index, folders);
    const compositeOpacity = folderOpacity * local;
    const interactive = state.archiveReady && interactiveOpacity * local > 0.3;
    const gatheredCenter = metrics.portalsWidth * (0.5 + gatheredOffsets[index]);
    const gatherX = (gatheredCenter - metrics.portalOffsets[index]) * handoff;
    const gatherY = lerp(0, -52, handoff);
    const folderScale = lerp(1, 0.78, handoff);
    const folderRotation = rotations[index] * lerp(1, 0.55, handoff);
    button.style.opacity = local.toFixed(3);
    button.style.transform = `translate(-50%, -50%) translate(${gatherX.toFixed(1)}px, ${(lerp(120, 0, local) + gatherY).toFixed(1)}px) scale(${(lerp(0.72, 1, local) * folderScale).toFixed(3)}) rotate(${folderRotation.toFixed(2)}deg)`;
    setButtonInteractive(button, interactive);
    foldersAreInteractive ||= interactive;
  });
  elements.portals.style.opacity = folderOpacity.toFixed(3);
  // 容器只要有任何可见度就吃住点击（防止穿透到每日图片触发换图）；
  // 按钮自身再按 interactive 门控。
  elements.portals.classList.toggle("is-ready", folderOpacity > 0.01 || foldersAreInteractive);

  const allEntry = smoothstep(...archiveTimeline.allEntry, progress);
  elements.archiveAll.style.opacity = (allEntry * (1 - archiveExit)).toFixed(3);
  elements.archiveAll.style.transform = `translateY(${(lerp(12, 0, allEntry) - 20 * archiveExit).toFixed(1)}px)`;
  elements.scrollCue.style.opacity = scrollCueOpacity(progress).toFixed(3);
  const archiveIsInteractive = state.archiveReady && allEntry > 0.82 && handoff < 0.18;
  setButtonInteractive(elements.archiveAll, archiveIsInteractive);
  elements.archiveAll.classList.toggle("is-ready", archiveIsInteractive);
}

export function scheduleStoryUpdate() {
  if (state.animationFrame) return;
  state.animationFrame = requestAnimationFrame(updateStory);
}

export function invalidateMotionLayout() {
  state.motionMetrics = null;
  state.staticMotionApplied = false;
  scheduleStoryUpdate();
}
