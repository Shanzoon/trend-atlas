export const COLLECTION_PAGE_SIZE = 12;

export const state = {
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
  collectionRenderedCount: 0,
  animationFrame: 0,
  folderPreviewsHydrated: false,
  motionMetrics: null,
  staticMotionApplied: false,
};

export function nextCollectionPageEnd(renderedCount, totalCount) {
  return Math.min(renderedCount + COLLECTION_PAGE_SIZE, totalCount);
}

export function itemsForScope(scope) {
  if (scope === "all") return state.allItems;
  return state.allItems.filter((item) => item.category === scope);
}
