export const ARCHIVE_LOADING_DELAY_MS = 300;
export const ARCHIVE_TIMEOUT_MS = 10_000;

export function normalizeArchiveManifest(data) {
  if (!data || !Array.isArray(data.days)) throw new Error("归档格式无效");

  const days = data.days;
  const items = days
    .flatMap((day) => {
      if (!day || typeof day.date !== "string" || !Array.isArray(day.items)) {
        throw new Error("归档日期格式无效");
      }
      return day.items.map((item) => ({ ...item, date: day.date }));
    })
    .sort((first, second) => second.date.localeCompare(first.date) || first.title.localeCompare(second.title, "zh-CN"));

  if (!items.length) throw new Error("归档中没有图片");
  return { days, items };
}

export function createArchiveLoader({ path, fetchImpl = fetch, timeoutMs = ARCHIVE_TIMEOUT_MS }) {
  let pendingRequest = null;

  return function loadArchiveManifest() {
    if (pendingRequest) return pendingRequest;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    pendingRequest = (async () => {
      const response = await fetchImpl(path, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return normalizeArchiveManifest(await response.json());
    })().finally(() => {
      clearTimeout(timeout);
      pendingRequest = null;
    });

    return pendingRequest;
  };
}

export function scheduleDelayedArchiveFeedback(callback, delayMs = ARCHIVE_LOADING_DELAY_MS) {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}
