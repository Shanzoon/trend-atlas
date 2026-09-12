import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseHTML } from "linkedom";
import { createGallery } from "../holographic/gallery.js";
import { createCssCard } from "../holographic/css-card.js";

const template = await readFile(new URL("../brand.html", import.meta.url), "utf8");
const configs = Object.fromEntries(await Promise.all(["redline", "telemetry", "synth"].map(async (id) => [
  id, JSON.parse(await readFile(new URL(`../holographic/${id}/card-config.json`, import.meta.url), "utf8")),
])));

function environment(t, mobile = false) {
  const { document, window } = parseHTML(template);
  const gallery = document.querySelector("#holoGallery");
  const urls = new Set(), requests = [], frames = new Map(), cleanup = [], restore = [];
  let sequence = 0, now = 0;
  const globals = {
    document, window, devicePixelRatio: 2,
    matchMedia: (query) => ({ matches: query.includes("760px") && mobile, addEventListener() {} }),
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: (callback) => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    fetch: async (url, { signal } = {}) => {
      signal?.throwIfAborted();
      const name = new URL(url).pathname;
      requests.push(name);
      const id = name.split("/").find((part) => part in configs);
      return name.endsWith("card-config.json") ? Response.json(configs[id]) : new Response(new Blob(["test image"]));
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    restore.push(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
  // Decoding/layout are browser responsibilities; these tests exercise the real
  // gallery, controls, fallback loading, cancellation and resource ownership.
  const imagePrototype = Object.getPrototypeOf(document.createElement("img"));
  Object.defineProperty(imagePrototype, "decode", { configurable: true, value: async () => {} });
  t.after(() => { cleanup.forEach((fn) => fn()); restore.forEach((fn) => fn()); delete imagePrototype.decode; });
  t.mock.method(URL, "createObjectURL", () => { const url = `blob:test-${++sequence}`; urls.add(url); return url; });
  t.mock.method(URL, "revokeObjectURL", (url) => { assert.ok(urls.delete(url), "each object URL must be released once"); });
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  for (const element of gallery.querySelectorAll("#holoDeck, .holo-surface")) {
    element.getBoundingClientRect = () => ({ width: element.id === "holoDeck" && !mobile ? 1000 : 300, height: 400, left: 0, top: 0, bottom: 400 });
    let captured = null;
    element.setPointerCapture = (id) => { captured = id; };
    element.hasPointerCapture = (id) => captured === id;
    element.releasePointerCapture = () => { captured = null; };
    element.focus = () => {};
  }
  const tick = (count = 1) => {
    for (let step = 0; step < count; step++) {
      now += 40;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach((callback) => callback(now));
    }
  };
  const emit = (element, type, values = {}) => {
    const event = new window.Event(type);
    Object.assign(event, values);
    element.dispatchEvent(event);
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) { tick(); return; }
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`fallback did not settle: ${gallery.querySelector("#holoStatus").textContent}`);
  };
  return { gallery, urls, requests, tick, emit, waitFor, frames, cleanup };
}

it("keeps three cards interactive when WebGL cannot be created, and pauses offscreen", async (t) => {
  const env = environment(t);
  const { gallery, waitFor, emit, tick } = env;
  const viewer = await createGallery(gallery);
  env.cleanup.push(() => viewer.setActive(false));
  assert.equal(env.requests.length, 0, "inactive cards must stay lazy");
  viewer.setActive(true);
  await waitFor(() => gallery.querySelectorAll(".is-ready").length === 3);
  assert.equal(gallery.dataset.rendererCount, "0");
  assert.equal(gallery.querySelectorAll(".holo-css-wrap").length, 3);
  assert.ok(env.requests.every((url) => !url.endsWith(".glb")), "CSS fallback needs no 3D models");
  assert.equal(env.urls.size, 14);
  for (const wrap of gallery.querySelectorAll(".holo-css-wrap")) {
    const z = (role) => Number(wrap.querySelector(`[data-layer="${role}"]`).style.transform.match(/translateZ\(([-\d.]+)/)[1]);
    assert.ok(z("background") < z("subject"), "configured background depth must not cover the artwork");
  }
  for (const button of gallery.querySelectorAll(".holo-controls button")) assert.equal(button.disabled, false);
  assert.equal(gallery.querySelector("#holoSave").disabled, true, "original CSS viewer does not export WebGL frames");
  const surface = gallery.querySelector('[data-card="telemetry"] .holo-surface');
  emit(surface, "pointerdown", { isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  emit(surface, "pointermove", { pointerId: 1, clientX: 170, clientY: 140 });
  emit(surface, "pointerup", { pointerId: 1 });
  tick(40);
  assert.equal(gallery.dataset.selected, "telemetry");
  assert.ok(Number(surface.parentElement.dataset.angleY) > .2, "drag must rotate the selected CSS card");
  for (const finish of ["gold", "silver", "original", "pearl"]) {
    gallery.querySelector(`button[data-finish="${finish}"]`).click();
    assert.equal(surface.querySelector(".holo-css-wrap").dataset.finish, finish);
    assert.equal(gallery.querySelector('[data-card="redline"] .holo-css-wrap').dataset.finish, "pearl");
  }
  gallery.querySelector("#holoFlip").click(); tick(40);
  assert.ok(Math.abs(Number(surface.parentElement.dataset.angleY) - Math.PI) < .01);
  for (const input of gallery.querySelectorAll("[data-parameter]")) {
    const old = Number(input.value);
    input.value = String(old - .1);
    emit(input, "input");
    assert.ok(Math.abs(Number(input.value) - (old - .1)) < .001);
  }
  gallery.querySelector("#holoReset").click(); tick(40);
  assert.equal(gallery.dataset.flipped, "false");
  assert.equal(Number(gallery.querySelector("#holo-scale").value), configs.telemetry.parameters.subjectScale);
  viewer.setActive(false);
  const stoppedAt = gallery.dataset.frames;
  tick(60);
  assert.equal(env.frames.size, 0);
  assert.equal(gallery.dataset.frames, stoppedAt);
});

it("unloads mobile CSS cards and restores the selected card's controls", async (t) => {
  const env = environment(t, true);
  const { gallery, waitFor, emit } = env;
  const viewer = await createGallery(gallery);
  env.cleanup.push(() => viewer.setActive(false));
  viewer.setActive(true);
  await waitFor(() => gallery.querySelectorAll(".is-ready").length === 1);
  gallery.querySelector('button[data-finish="gold"]').click();
  gallery.querySelector("#holoFlip").click();
  const foil = gallery.querySelector("#holo-foil");
  foil.value = ".17"; emit(foil, "input");
  for (const id of ["telemetry", "synth", "telemetry", "redline"]) {
    gallery.querySelector(`button[data-select="${id}"]`).click();
    await waitFor(() => gallery.querySelector(`[data-card="${id}"] .is-ready`));
    assert.equal(gallery.querySelectorAll(".holo-css-wrap").length, 1);
    assert.equal(env.urls.size, id === "redline" ? 4 : 5, "inactive image URLs must be revoked");
  }
  assert.equal(gallery.dataset.finish, "gold");
  assert.equal(gallery.dataset.flipped, "true");
  assert.equal(Number(foil.value), .17);
  assert.ok(env.requests.filter((url) => !url.endsWith(".json")).every((url) => url.includes("/mobile/")));
});

it("keeps a failed card's retry visible when the other cards finish loading", async (t) => {
  const env = environment(t);
  const fetchAsset = globalThis.fetch;
  let recovered = false, releaseOthers;
  const othersReady = new Promise((resolve) => { releaseOthers = resolve; });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const name = new URL(url).pathname;
    if (name.endsWith("card-config.json")) {
      if (name.includes("/redline/") && !recovered) return new Response("Unavailable", { status: 503 });
      if (!name.includes("/redline/")) await othersReady;
    }
    return fetchAsset(url, options);
  });
  const viewer = await createGallery(env.gallery);
  env.cleanup.push(() => viewer.setActive(false));
  viewer.setActive(true);
  const retry = env.gallery.querySelector("#holoRetry");
  const status = env.gallery.querySelector("#holoStatus");
  await env.waitFor(() => !retry.hidden);
  releaseOthers();
  await env.waitFor(() => env.gallery.querySelectorAll(".is-ready").length === 2);
  assert.equal(retry.hidden, false, "later successes must not hide another card's failure");
  assert.match(status.textContent, /REDLINE.*暂未加载成功/);
  recovered = true;
  retry.click();
  await env.waitFor(() => env.gallery.querySelectorAll(".is-ready").length === 3);
  assert.equal(retry.hidden, true);
  assert.doesNotMatch(status.textContent, /暂未加载成功/);
});

it("falls back after shader compilation fails and disposes the failed WebGL scenes", async (t) => {
  const env = environment(t);
  const directory = await mkdtemp(path.join(tmpdir(), "holo-shader-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Isolate only the GPU boundary; execute unchanged gallery control/loading code
  // and the real CSS implementation under the shader-failure diagnostics.
  const vendor = `export class WebGLRenderer {
    domElement = document.createElement('canvas');
    info = { programs: [{ program: {} }], memory: { textures: 0 } };
    getContext() { return { LINK_STATUS: 35714, getProgramParameter: () => false }; }
    setClearColor() {} compile() {} dispose() {}
  }`;
  const scene = `export async function createCardScene() {
    return { scene: {}, camera: {}, dispose() { document.body.dataset.disposed = String(Number(document.body.dataset.disposed || 0) + 1); } };
  }`;
  const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
  const source = (await readFile(new URL("../holographic/gallery.js", import.meta.url), "utf8"))
    .replace('"./vendor.js"', JSON.stringify(dataModule(vendor)))
    .replace('"./card-scene.js"', JSON.stringify(dataModule(scene)))
    .replace('"./css-card.js"', JSON.stringify(new URL("../holographic/css-card.js", import.meta.url).href));
  const modulePath = path.join(directory, "gallery.mjs");
  await writeFile(modulePath, source);
  const { createGallery: createShaderGallery } = await import(pathToFileURL(modulePath));
  const viewer = await createShaderGallery(env.gallery);
  env.cleanup.push(() => viewer.setActive(false));
  viewer.setActive(true);
  await env.waitFor(() => env.gallery.querySelectorAll(".is-ready").length === 3);
  assert.equal(env.gallery.ownerDocument.body.dataset.disposed, "3");
  assert.equal(env.gallery.querySelectorAll(".holo-css-wrap").length, 3);
  assert.equal(env.gallery.querySelector(".holo-canvas").hidden, true);
  env.gallery.querySelector("#holoFlip").click(); env.tick(40);
  assert.equal(env.gallery.dataset.flipped, "true");
  assert.ok(Math.abs(Number(env.gallery.querySelector('[data-card="redline"]').dataset.angleY) - Math.PI) < .01);
});

it("releases decoded images without mounting a card after loading is cancelled", async (t) => {
  const env = environment(t);
  const surface = env.gallery.querySelector(".holo-surface");
  const decoded = [];
  Object.defineProperty(Object.getPrototypeOf(surface.ownerDocument.createElement("img")), "decode", {
    configurable: true, value: () => new Promise((resolve) => decoded.push(resolve)),
  });
  const controller = new AbortController();
  const loading = createCssCard({ config: configs.redline, baseUrl: "https://cards.test/redline/", surface, signal: controller.signal });
  await env.waitFor(() => decoded.length === 4);
  controller.abort();
  decoded.forEach((resolve) => resolve());
  await assert.rejects(loading, { name: "AbortError" });
  assert.equal(surface.querySelector(".holo-css-wrap"), null);
  assert.equal(env.urls.size, 0);
});
