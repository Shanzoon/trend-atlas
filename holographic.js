// Lightweight visibility gate: the homepage never imports Three.js until chapter 02 appears.
let gallery, viewer, loading;
let visible = false;
let active = false;
let staticVisible = false;
const staticLayout = matchMedia("(max-width: 760px), (prefers-reduced-motion: reduce)");

async function updateActivity() {
  if (!gallery || gallery.hidden) return;
  const next = (staticLayout.matches ? staticVisible : visible)
    && document.body.dataset.page === "home" && !document.hidden;
  active = next;
  if (!next && !document.hidden) gallery.querySelector("dialog[open]")?.close();
  if (viewer) { viewer.setActive(next); return; }
  if (!next || loading) return;
  const status = gallery.querySelector("#holoStatus");
  status.textContent = "正在唤醒卡片…";
  for (const poster of gallery.querySelectorAll(".holo-poster")) {
    if (!matchMedia("(max-width: 760px)").matches || poster.closest(".is-selected")) poster.src = poster.dataset.poster;
  }
  gallery.querySelectorAll(".holo-controls button, .holo-settings-actions button").forEach((button) => { button.disabled = true; });
  loading = import("./holographic/gallery.js").then(async ({ createGallery }) => {
    viewer = await createGallery(gallery);
    viewer.setActive(active);
  }).catch((error) => {
    status.textContent = "暂时无法开启 3D，可先浏览封面。";
    gallery.querySelectorAll("[data-select]").forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.select;
        for (const card of gallery.querySelectorAll("[data-card]")) {
          card.classList.toggle("is-selected", card.dataset.card === id);
          if (card.dataset.card === id) card.querySelector("img").src = card.querySelector("img").dataset.poster;
        }
        gallery.querySelectorAll("[data-select]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.select === id)));
      };
    });
    const retry = gallery.querySelector("#holoRetry");
    retry.hidden = false;
    retry.onclick = () => location.reload();
    console.error("Holographic gallery failed", error);
  }).finally(() => { loading = null; });
}

export function initHolographic() {
  gallery = document.querySelector("#holoGallery");
  if (!gallery || gallery.hidden) return;
  const stage = document.querySelector("#brightStage");
  const archiveCopy = document.querySelector("#archiveCopy");
  const orderChapters = () => {
    gallery.querySelector(".holo-hint").textContent = matchMedia("(max-width: 760px)").matches
      ? "拖动卡面旋转 · 卡面外滑动浏览主页"
      : "拖动卡面旋转 · Alt + 滚轮缩放";
    if (staticLayout.matches) {
      document.querySelector("#dailyArt").after(gallery);
      gallery.after(archiveCopy);
    } else {
      stage.after(gallery);
      document.querySelector("#stageIdentity").after(archiveCopy);
    }
  };
  orderChapters();
  staticLayout.addEventListener("change", orderChapters);
  new IntersectionObserver(([entry]) => {
    staticVisible = entry.isIntersecting;
    updateActivity();
  }, { threshold: 0 }).observe(gallery);
  new MutationObserver(updateActivity).observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
  document.addEventListener("visibilitychange", updateActivity);
  staticLayout.addEventListener("change", updateActivity);
}

export function setHolographicVisibility(opacity) {
  if (!gallery || gallery.hidden) return;
  const isStatic = opacity === null;
  gallery.style.opacity = isStatic ? "" : opacity.toFixed(3);
  gallery.style.transform = isStatic ? "" : `translateY(${(1 - opacity) * 24}px)`;
  gallery.style.pointerEvents = isStatic || opacity > 0.85 ? "auto" : "none";
  gallery.inert = !isStatic && opacity <= 0.85;
  if (gallery.inert) gallery.querySelector("dialog[open]")?.close();
  const next = !isStatic && opacity > 0.01;
  if (visible !== next) { visible = next; updateActivity(); }
}
