import { elements } from "./elements.js?v=20260902-swipe1";

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(start, end, value) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

export function clearMotionStyles(element) {
  element.removeAttribute("style");
}

export function setButtonInteractive(button, enabled) {
  if (!enabled && document.activeElement === button) elements.homeLink.focus({ preventScroll: true });
  if (button.disabled !== !enabled) button.disabled = !enabled;
  if (button.tabIndex !== (enabled ? 0 : -1)) button.tabIndex = enabled ? 0 : -1;
}

export function setContainerInteractive(element, enabled) {
  if (!enabled && element.contains(document.activeElement)) elements.homeLink.focus({ preventScroll: true });
  if (element.hasAttribute("inert") === enabled) element.toggleAttribute("inert", !enabled);
  const pointerEvents = enabled ? "auto" : "none";
  if (element.style.pointerEvents !== pointerEvents) element.style.pointerEvents = pointerEvents;
}

export function stableDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
