// Adapted from RuiC-card-skill's CSS-3D fallback (MIT, see LICENSE-RuiC.txt).
// Shares the gallery's controls and animation loop; owns only this card's DOM/images.
const PARAMETERS = { foil: "uFoil", scale: "uScale", depth: "uDepth", "fx-depth": "uFxDepth", "bg-depth": "uBgDepth" };
const LAYERS = { background: -48, effects: -25, subject: -8, lineart: 24, text: 28 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function createCssCard({ config, baseUrl, surface, signal }) {
  signal?.throwIfAborted();
  const document = surface.ownerDocument;
  const wrap = document.createElement("div");
  wrap.className = "holo-css-wrap";
  wrap.setAttribute("aria-hidden", "true");
  const rotation = document.createElement("div");
  rotation.className = "holo-css-rotation";
  const front = document.createElement("div");
  front.className = "holo-css-face holo-css-front";
  const back = document.createElement("div");
  back.className = "holo-css-face holo-css-back";
  for (const [name, text] of Object.entries({
    collection: config.collection || "PERSONAL COLLECTION",
    mark: (config.title || "S").slice(0, 1),
    title: config.subtitle || config.title,
    edition: config.edition || "ART STUDY",
  })) {
    const label = document.createElement("span");
    label.className = `holo-css-back-${name}`;
    label.textContent = text;
    back.append(label);
  }
  rotation.append(front, back);
  wrap.append(rotation);
  const layers = new Map(), urls = new Set();
  let disposed = false, auto = true, flipped = false, zoom = 1;
  let finish = config.appearance?.finish || "pearl", targetX = -.035, targetY = -.15;
  let width = 0, height = 0, cardWidth = 0;
  const root = { rotation: { x: targetX, y: targetY } };
  const defaults = {
    foil: config.parameters?.foil ?? .52,
    scale: config.parameters?.subjectScale ?? 1,
    depth: config.parameters?.subjectDepth ?? .32,
    "fx-depth": config.parameters?.effectsDepth ?? .14,
    "bg-depth": config.parameters?.backgroundDepth ?? -.18,
  };
  const uniforms = Object.fromEntries(Object.entries(PARAMETERS).map(([key, name]) => [name, { value: defaults[key] }]));
  uniforms.uHasFx = { value: config.assets.effects ? 1 : 0 };
  function dispose() {
    if (disposed) return;
    disposed = true;
    wrap.remove();
    for (const layer of layers.values()) layer.querySelector("img").removeAttribute("src");
    for (const url of urls) URL.revokeObjectURL(url);
    layers.clear(); urls.clear();
  }
  try {
    // Keep ordering deterministic even when images finish in a different order.
    const results = await Promise.allSettled(Object.keys(LAYERS).filter((role) => config.assets[role]).map(async (role) => {
      const layer = document.createElement("div"), img = document.createElement("img");
      layer.className = "holo-css-layer";
      layer.dataset.layer = role;
      img.alt = ""; img.draggable = false;
      layer.append(img); front.append(layer); layers.set(role, layer);
      const response = await fetch(new URL(config.assets[role], baseUrl), { signal });
      if (!response.ok) throw new Error(`卡片图层 ${response.status}`);
      const blob = await response.blob();
      signal?.throwIfAborted();
      const url = URL.createObjectURL(blob);
      urls.add(url); img.src = url;
      await img.decode();
      signal?.throwIfAborted();
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    signal?.throwIfAborted();
    const foil = document.createElement("div");
    foil.className = "holo-css-foil";
    front.append(foil);

    function layoutLayers() {
      let top = 0;
      for (const [role, layer] of layers) {
        const depth = role === "background" ? uniforms.uBgDepth.value : role === "effects" ? uniforms.uFxDepth.value : uniforms.uDepth.value;
        // Offset the ordered stack: multiplying negative base depths by the
        // configured values can put an opaque background in front of the subject.
        const z = (LAYERS[role] + depth * 32) * cardWidth / 600;
        top = Math.max(top, z);
        const scale = role === "background" ? 1 : 1 / uniforms.uScale.value;
        layer.style.transform = `translateZ(${z.toFixed(2)}px) scale(${scale})`;
      }
      foil.style.transform = `translateZ(${top + 1}px)`;
      front.style.setProperty("--foil-amount", String(uniforms.uFoil.value));
    }
    function resize(nextWidth, nextHeight) {
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth; height = nextHeight;
      cardWidth = Math.min(width * .84, height * .84 * 2 / 3);
      rotation.style.width = `${cardWidth}px`;
      rotation.style.height = `${cardWidth * 1.5}px`;
      rotation.style.setProperty("--card-unit", `${cardWidth / 100}px`);
      layoutLayers();
    }
    const setAuto = (value) => { auto = Boolean(value); };
    const setFinish = (value) => { finish = value; wrap.dataset.finish = value; };
    function setParameter(key, value) {
      if (!PARAMETERS[key]) throw new RangeError(`Unknown card parameter: ${key}`);
      if (!Number.isFinite(Number(value))) throw new TypeError(`Card parameter must be finite: ${key}`);
      uniforms[PARAMETERS[key]].value = Number(value);
      layoutLayers();
    }
    function setZoom(value) {
      if (!Number.isFinite(Number(value))) throw new TypeError("Card zoom must be finite");
      zoom = clamp(Number(value), .82, 1.05);
    }
    function flip(value = !flipped) {
      flipped = Boolean(value); auto = false;
      targetY = flipped ? Math.PI : 0; targetX = 0;
    }
    function rotate(dx, dy) {
      auto = false;
      const base = flipped ? Math.PI : 0;
      targetY = clamp(targetY + Number(dx || 0) * .006, base - .65, base + .65);
      targetX = clamp(targetX + Number(dy || 0) * .004, -.36, .36);
    }
    function reset() {
      targetX = -.035; targetY = -.15; zoom = 1; flipped = false; auto = false;
      for (const [key, value] of Object.entries(defaults)) setParameter(key, value);
      setFinish(config.appearance?.finish || "pearl");
    }
    function update(dt, elapsed, reduced = false) {
      if (disposed) return false;
      if (auto) {
        targetY = Math.sin(elapsed * .42) * .23 - .055;
        targetX = Math.sin(elapsed * .53) * .055 - .018;
      }
      const ease = reduced ? 1 : 1 - Math.exp(-Math.max(0, dt) * 8);
      root.rotation.x += (targetX - root.rotation.x) * ease;
      root.rotation.y += (targetY - root.rotation.y) * ease;
      rotation.style.transform = `rotateX(${root.rotation.x}rad) rotateY(${root.rotation.y}rad) scale(${zoom})`;
      front.style.setProperty("--mx", `${50 + Math.sin(root.rotation.y) * 65 + Math.sin(elapsed * .65) * 15}%`);
      front.style.setProperty("--my", `${45 + Math.sin(root.rotation.x) * 65}%`);
      return auto || Math.abs(targetX - root.rotation.x) > .0005 || Math.abs(targetY - root.rotation.y) > .0005;
    }
    const state = Object.freeze({
      get auto() { return auto; }, get flipped() { return flipped; }, get finish() { return finish; },
      get zoom() { return zoom; }, get targetX() { return targetX; }, get targetY() { return targetY; },
    });
    setFinish(finish);
    surface.append(wrap);
    return { isFallback: true, root, uniforms, state, resize, update, rotate, flip, setAuto, setFinish, setParameter, setZoom, reset, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
