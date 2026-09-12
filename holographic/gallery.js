import * as THREE from "./vendor.js";
import { createCardScene } from "./card-scene.js";

const IDS = ["redline", "telemetry", "synth"];
const UNIFORMS = { foil: "uFoil", scale: "uScale", depth: "uDepth", "fx-depth": "uFxDepth", "bg-depth": "uBgDepth" };

export async function createGallery(gallery) {
  const $ = (selector) => gallery.querySelector(selector);
  const deck = $("#holoDeck");
  const status = $("#holoStatus");
  const retry = $("#holoRetry");
  const mobile = matchMedia("(max-width: 760px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const cards = new Map(IDS.map((id) => [id, $(`[data-card="${id}"]`)]));
  const scenes = new Map();
  const pending = new Map();
  const saved = new Map();
  const failed = new Set();
  let selected = "redline", active = false, motion = !reduced.matches;
  let frame = 0, lastFrame = 0, elapsed = 0, frameCount = 0, pointer = null;
  let contextLost = false;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = "holo-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    deck.append(renderer.domElement);
  } catch (error) {
    renderer?.dispose(); renderer = null;
    console.warn("WebGL unavailable; using layered CSS cards", error);
  }
  gallery.dataset.rendererCount = renderer ? "1" : "0";

  const current = () => scenes.get(selected);
  const desiredIds = () => mobile.matches ? [selected] : IDS;
  function syncStatus() {
    if (contextLost) return;
    const failure = desiredIds().find((id) => failed.has(id));
    retry.hidden = !failure;
    status.textContent = failure ? `${failure.toUpperCase()} 暂未加载成功，封面仍可查看。`
      : [...scenes.values()].some((scene) => scene.isFallback) ? "轻量 3D 模式 · 可旋转、翻面和调整材质" : "";
  }
  function showPosters() {
    for (const id of desiredIds()) {
      const poster = cards.get(id).querySelector("img");
      if (!poster.hasAttribute("src")) poster.src = poster.dataset.poster;
    }
  }
  function remember(id, card) {
    saved.set(id, { state: { ...card.state }, parameters: Object.fromEntries(Object.entries(UNIFORMS).map(([key, uniform]) => [key, card.uniforms[uniform].value])) });
  }
  function unload(id) {
    pending.get(id)?.abort();
    const card = scenes.get(id);
    if (card) { remember(id, card); card.dispose(); scenes.delete(id); }
    cards.get(id).querySelector(".holo-surface").classList.remove("is-ready");
  }
  async function loadCard(id) {
    if (scenes.has(id) || pending.has(id) || !active) return;
    const aborter = new AbortController();
    pending.set(id, aborter);
    failed.delete(id);
    syncStatus();
    const timeout = setTimeout(() => aborter.abort(new DOMException("卡片加载超时", "TimeoutError")), 20000);
    const compact = mobile.matches;
    const baseUrl = new URL(`./${id}/`, import.meta.url).href;
    let card;
    cards.get(id).setAttribute("aria-busy", "true");
    try {
      const response = await fetch(new URL("card-config.json", baseUrl), { signal: aborter.signal });
      if (!response.ok) throw new Error(`卡片配置 ${response.status}`);
      const config = await response.json();
      config.textureResolution = compact ? 512 : 1024;
      if (compact) for (const role of Object.keys(config.assets)) {
        if (role !== "model") config.assets[role] = config.assets[role].replace("./assets/", "./mobile/");
      }
      const fallback = async () => {
        const { createCssCard } = await import("./css-card.js");
        return createCssCard({ config, baseUrl, surface: cards.get(id).querySelector(".holo-surface"), signal: aborter.signal });
      };
      if (renderer) {
        card = await createCardScene({ config, baseUrl, renderer, signal: aborter.signal });
        try {
          renderer.compile(card.scene, card.camera);
          // Three.js populates diagnostics lazily on first use, after compile().
          // Check the linked programs directly before accepting this card.
          const gl = renderer.getContext();
          if (renderer.info.programs?.some((p) => !gl.getProgramParameter(p.program, gl.LINK_STATUS))) throw new Error("当前设备无法显示卡片材质");
        } catch (error) {
          card.dispose(); card = null;
          console.warn(`Card ${id} shaders unavailable; using CSS`, error);
          card = await fallback();
        }
      } else card = await fallback();
      if (aborter.signal.aborted || compact !== mobile.matches || !desiredIds().includes(id)) { card.dispose(); return; }
      const previous = saved.get(id);
      if (previous) {
        for (const [key, value] of Object.entries(previous.parameters)) card.setParameter(key, value);
        card.setFinish(previous.state.finish);
        card.setZoom(previous.state.zoom);
        card.flip(previous.state.flipped);
        card.rotate((previous.state.targetY - (previous.state.flipped ? Math.PI : 0)) / .006, previous.state.targetX / .004);
      }
      card.setAuto(motion && (previous?.state.auto ?? true));
      scenes.set(id, card);
      cards.get(id).querySelector(".holo-surface").classList.add("is-ready");
      syncStatus();
      syncControls();
      requestRender();
    } catch (error) {
      card?.dispose();
      if (error.name !== "AbortError") {
        failed.add(id);
        syncStatus();
        console.error(`Card ${id} failed`, error);
      }
    } finally {
      clearTimeout(timeout);
      if (pending.get(id) === aborter) pending.delete(id);
      cards.get(id).setAttribute("aria-busy", "false");
      if (active && aborter.signal.reason?.name === "AbortError" && desiredIds().includes(id)) loadCard(id);
    }
  }
  function ensureVisible() {
    showPosters();
    desiredIds().forEach(loadCard);
  }
  function syncControls() {
    const card = current();
    $("#holoSettingsCard").textContent = `${selected.toUpperCase()} / 0${IDS.indexOf(selected) + 1}`;
    gallery.dataset.selected = selected;
    gallery.querySelectorAll(".holo-controls button, .holo-settings-actions button, [data-parameter]").forEach((button) => { button.disabled = !card; });
    $("#holoMotion").disabled = !scenes.size;
    // The original CSS viewer also requires WebGL for PNG export.
    $("#holoSave").disabled = !card || Boolean(card.isFallback);
    $("#holoSave").title = card?.isFallback ? "保存卡面需要完整 3D 模式" : "";
    if (!card) return;
    gallery.querySelectorAll("[data-finish]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.finish === card.state.finish)));
    gallery.dataset.finish = card.state.finish;
    gallery.dataset.flipped = String(card.state.flipped);
    $("#holoFlip").setAttribute("aria-label", card.state.flipped ? "翻到正面" : "翻到背面");
    $("#holoMotion").setAttribute("aria-pressed", String(motion));
    $("#holoMotion span").textContent = motion ? "开" : "关";
    for (const input of gallery.querySelectorAll("[data-parameter]")) {
      const key = input.dataset.parameter;
      input.value = key === "zoom" ? card.state.zoom : card.uniforms[UNIFORMS[key]].value;
      input.disabled = (key === "foil" && card.state.finish === "original") || (key === "fx-depth" && !card.uniforms.uHasFx.value);
      input.previousElementSibling.value = Number(input.value).toFixed(2);
    }
  }
  function select(id) {
    if (!IDS.includes(id)) return;
    selected = id;
    for (const [key, element] of cards) {
      element.classList.toggle("is-selected", key === selected);
      element.querySelector(".holo-surface").setAttribute("aria-pressed", String(key === selected));
    }
    gallery.querySelectorAll("[data-select]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.select === selected)));
    if (mobile.matches) for (const key of IDS) { if (key !== selected) unload(key); }
    syncControls();
    ensureVisible();
    requestRender();
  }
  function setMotion(value) {
    motion = value;
    for (const card of scenes.values()) {
      if (value) card.flip(false);
      card.setAuto(value);
    }
    syncControls();
    requestRender();
  }
  function draw(dt) {
    const bounds = deck.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    const ratio = Math.min(devicePixelRatio, mobile.matches ? 1.25 : 1.5);
    const hasWebGL = renderer && desiredIds().some((id) => scenes.has(id) && !scenes.get(id).isFallback);
    if (renderer) renderer.domElement.hidden = !hasWebGL;
    if (hasWebGL) {
      if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
      const size = renderer.getSize(new THREE.Vector2());
      if (size.x !== bounds.width || size.y !== bounds.height) renderer.setSize(bounds.width, bounds.height, false);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
    }
    let moving = false;
    for (const id of desiredIds()) {
      const card = scenes.get(id);
      if (!card) continue;
      const rect = cards.get(id).querySelector(".holo-surface").getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      card.resize(rect.width, rect.height);
      moving = card.update(dt, elapsed, reduced.matches) || moving;
      if (!card.isFallback) {
        const x = rect.left - bounds.left, y = bounds.bottom - rect.bottom;
        renderer.setViewport(x, y, rect.width, rect.height);
        renderer.setScissor(x, y, rect.width, rect.height);
        renderer.render(card.scene, card.camera);
      }
      cards.get(id).dataset.angleX = card.root.rotation.x.toFixed(4);
      cards.get(id).dataset.angleY = card.root.rotation.y.toFixed(4);
    }
    frameCount++;
    gallery.dataset.frames = String(frameCount);
    gallery.dataset.loadedCards = [...scenes.keys()].join(",");
    gallery.dataset.pixelRatio = String(ratio);
    gallery.dataset.textureCount = String(renderer?.info.memory.textures || 0);
    return moving;
  }
  function tick(now) {
    frame = 0;
    if (!active || contextLost || !scenes.size) return;
    const interval = 1000 / (pointer && !mobile.matches ? 60 : 30);
    if (lastFrame && now - lastFrame < interval - 1) { frame = requestAnimationFrame(tick); return; }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .06) : 1 / 30;
    lastFrame = now;
    if (motion) elapsed += dt;
    const moving = draw(dt);
    if (motion || moving) frame = requestAnimationFrame(tick);
  }
  function requestRender() {
    if (active && !frame && !contextLost) frame = requestAnimationFrame(tick);
  }
  function releasePointer() {
    if (!pointer) return;
    const surface = cards.get(pointer.id).querySelector(".holo-surface");
    if (surface.hasPointerCapture(pointer.pointerId)) surface.releasePointerCapture(pointer.pointerId);
    surface.classList.remove("is-dragging");
    pointer = null;
  }
  for (const [id, element] of cards) {
    const surface = element.querySelector(".holo-surface");
    surface.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) { releasePointer(); return; }
      if (event.button !== 0) return;
      select(id);
      if (!current()) return;
      current().setAuto(false);
      pointer = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      surface.classList.add("is-dragging");
      surface.focus({ preventScroll: true });
    });
    surface.addEventListener("pointermove", (event) => {
      if (pointer?.pointerId !== event.pointerId || pointer.id !== id) return;
      current()?.rotate(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer.x = event.clientX; pointer.y = event.clientY;
      requestRender();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) surface.addEventListener(type, releasePointer);
    surface.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "f", "F", "r", "R", " ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      select(id);
      const card = current();
      if (!card) return;
      if (event.key.toLowerCase() === "f") card.flip();
      else if (event.key.toLowerCase() === "r") card.reset();
      else if (event.key === " ") setMotion(!motion);
      else if (event.key === "ArrowLeft") card.rotate(-14, 0);
      else if (event.key === "ArrowRight") card.rotate(14, 0);
      else if (event.key === "ArrowUp") card.rotate(0, -15);
      else if (event.key === "ArrowDown") card.rotate(0, 15);
      syncControls(); requestRender();
    });
    surface.addEventListener("wheel", (event) => {
      // Normal wheel scrolling remains page navigation. Alt+wheel also preserves zoom.
      if (!event.altKey || !scenes.has(id)) return;
      event.preventDefault(); select(id);
      current().setZoom(Math.max(.82, Math.min(1.05, current().state.zoom - event.deltaY * .001)));
      syncControls(); requestRender();
    }, { passive: false });
  }
  gallery.querySelectorAll("[data-select]").forEach((button) => button.addEventListener("click", () => select(button.dataset.select)));
  gallery.querySelectorAll("[data-finish]").forEach((button) => button.addEventListener("click", () => {
    current()?.setFinish(button.dataset.finish); syncControls(); requestRender();
  }));
  $("#holoFlip").onclick = () => { current()?.flip(); syncControls(); requestRender(); };
  $("#holoMotion").onclick = () => setMotion(!motion);
  $("#holoSettingsOpen").onclick = () => $("#holoSettings").showModal();
  $("#holoReset").onclick = () => { current()?.reset(); syncControls(); requestRender(); };
  gallery.querySelectorAll("[data-parameter]").forEach((input) => input.addEventListener("input", () => {
    const card = current();
    if (!card) return;
    if (input.dataset.parameter === "zoom") card.setZoom(Number(input.value));
    else card.setParameter(input.dataset.parameter, Number(input.value));
    syncControls(); requestRender();
  }));
  $("#holoSave").onclick = () => {
    const card = current();
    if (!card || card.isFallback) return;
    const exportId = selected, exportFlipped = card.state.flipped;
    const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(1); renderer.setSize(1000, 1400, false);
      card.resize(1000, 1400);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, 1000, 1400); renderer.clear(); renderer.render(card.scene, card.camera);
      renderer.domElement.toBlob((blob) => {
        if (!blob) { status.textContent = "未能保存卡面，请重试。"; return; }
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.download = `${exportId}-${exportFlipped ? "back" : "front"}.png`;
        link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    } finally {
      renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false); draw(0);
    }
  };
  retry.onclick = () => {
    if (contextLost) { location.reload(); return; }
    retry.hidden = true; status.textContent = "正在重新加载…"; ensureVisible();
  };
  new ResizeObserver(requestRender).observe(deck);
  mobile.addEventListener("change", () => {
    releasePointer(); IDS.forEach(unload); ensureVisible(); syncControls(); requestRender();
  });
  reduced.addEventListener("change", () => { if (reduced.matches) setMotion(false); requestRender(); });
  window.addEventListener("blur", releasePointer);
  renderer?.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault(); contextLost = true;
    cancelAnimationFrame(frame); frame = 0;
    status.textContent = "图形显示已暂停，请重新加载。"; retry.hidden = false;
    IDS.forEach((id) => cards.get(id).querySelector(".holo-surface").classList.remove("is-ready"));
  });
  syncControls();
  return {
    setActive(value) {
      active = value;
      gallery.dataset.active = String(value);
      if (active) { ensureVisible(); lastFrame = 0; requestRender(); }
      else {
        cancelAnimationFrame(frame); frame = 0; lastFrame = 0; releasePointer();
        for (const aborter of pending.values()) aborter.abort();
      }
    },
  };
}
