import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryDefinitions } from "../categories.js";
import { siteConfig } from "../site.config.js";
import { COLLECTION_PAGE_SIZE, nextCollectionPageEnd } from "../state.js";
import { progressWithHold, progressWithHolds, scrollCueOpacity, systemsTimeline } from "../timelines.js";
import { thumbHashToRGBA as decodeLocalThumbHash } from "../thumbhash.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_VERSION = "20260830-categoryarchive1";

const [dreamscape, lens] = categoryDefinitions;

const FIXTURE_FILES = {
  [`${dreamscape.id}/2026-08-17__interesting-04-moonlight-diner-double-sunrise.png`]: "moonlight fixture bytes",
  [`${lens.id}/2026-08-08__hottest-01-night-market.png`]: "night market fixture bytes",
  "_runs/2026-08-18/ignored-run-image.png": "run artifact bytes",
};

let server;
let serverOutput = "";
let baseUrl;
let fixtureRoot;

describe("scroll timeline hold", () => {
  it("starts the first product card as the systems scene begins", () => {
    assert.deepEqual(systemsTimeline.projectStarts, [0, 0.4, 0.68]);
  });

  it("keeps the original pace around a held key frame and clamps both ends", () => {
    const motionDistance = 1000;
    const holdProgress = 0.84;
    const holdDistance = 500;

    assert.equal(progressWithHold(420, motionDistance, holdProgress, holdDistance), 0.42);
    assert.equal(progressWithHold(840, motionDistance, holdProgress, holdDistance), holdProgress);
    assert.equal(progressWithHold(1100, motionDistance, holdProgress, holdDistance), holdProgress);
    assert.equal(progressWithHold(1440, motionDistance, holdProgress, holdDistance), 0.94);
    assert.equal(progressWithHold(-1, motionDistance, holdProgress, holdDistance), 0);
    assert.equal(progressWithHold(2000, motionDistance, holdProgress, holdDistance), 1);
  });

  it("keeps the original pace through multiple held key frames", () => {
    const motionDistance = 1000;
    const holds = [[0.30, 300], [0.61, 300], [0.89, 200]];

    assert.equal(progressWithHolds(300, motionDistance, holds), 0.30);
    assert.equal(progressWithHolds(600, motionDistance, holds), 0.30);
    assert.equal(progressWithHolds(700, motionDistance, holds), 0.40);
    assert.equal(progressWithHolds(910, motionDistance, holds), 0.61);
    assert.equal(progressWithHolds(1210, motionDistance, holds), 0.61);
    assert.equal(progressWithHolds(1310, motionDistance, holds), 0.71);
    assert.equal(progressWithHolds(1490, motionDistance, holds), 0.89);
    assert.equal(progressWithHolds(1690, motionDistance, holds), 0.89);
    assert.equal(progressWithHolds(1790, motionDistance, holds), 0.99);
    assert.equal(progressWithHolds(-1, motionDistance, holds), 0);
    assert.equal(progressWithHolds(1800, motionDistance, holds), 1);
  });
});

describe("shared archive scroll cue", () => {
  it("reuses one cue across the identity and archive visibility windows", () => {
    assert.equal(scrollCueOpacity(0), 1);
    assert.equal(scrollCueOpacity(0.16), 0);
    assert.equal(scrollCueOpacity(0.5), 0);
    assert.equal(scrollCueOpacity(0.72), 0);
    assert.ok(scrollCueOpacity(0.78) > 0);
    assert.equal(scrollCueOpacity(0.84), 1);
    assert.equal(scrollCueOpacity(0.98), 0);
  });
});

describe("collection pagination", () => {
  it("reveals archive images in bounded pages", () => {
    const total = 287;
    assert.equal(nextCollectionPageEnd(0, total), COLLECTION_PAGE_SIZE);
    assert.equal(nextCollectionPageEnd(COLLECTION_PAGE_SIZE, total), COLLECTION_PAGE_SIZE * 2);
    assert.equal(nextCollectionPageEnd(280, total), total);
    assert.equal(nextCollectionPageEnd(total, total), total);
  });
});

describe("archive navigation contract", () => {
  it("routes folders through their filtered archive and keeps VIEW ALL unfiltered", async () => {
    const views = await readFile(path.join(appRoot, "views.js"), "utf8");
    const app = await readFile(path.join(appRoot, "app.js"), "utf8");
    const folderHydration = views.slice(views.indexOf("export function hydrateFolderCovers"), views.indexOf("export function renderDailyItem"));
    const archiveNavigation = views.slice(views.indexOf("export function navigateToArchive"), views.indexOf("function navigateToDetail"));

    assert.match(folderHydration, /navigateToArchive\(definition\.id\)/, "each folder must open its filtered collection");
    assert.doesNotMatch(folderHydration, /navigateToDetail/, "folders must not skip directly to an image detail");
    assert.match(app, /archiveAll\.addEventListener\("click", \(\) => navigateToArchive\("all"\)\)/, "VIEW ALL must always clear the category filter");
    assert.match(archiveNavigation, /navigateToArchive\(scope = "all"[\s\S]*syncCollectionScope\(scope\)/, "archive navigation must receive its scope explicitly");
    assert.match(views, /navigateToArchive\(scope, false, state\.page === "detail" && state\.detailSource === "collection"\)/, "archive deep links must preserve their decoded scope");
    assert.match(views, /collectionTitle\.textContent = category \? category\.label\.toUpperCase\(\) : "ALL IMAGES"/, "the collection heading must identify the active category");
  });
});

describe("image loading contract", () => {
  it("decodes into reusable layers and bounds adjacent prefetching", async () => {
    const views = await readFile(path.join(appRoot, "views.js"), "utf8");
    const dailyRequest = views.slice(views.indexOf("async function requestDailyItem"), views.indexOf("function cancelDailyRequest"));
    const detailRequest = views.slice(views.indexOf("async function requestDetailItem"), views.indexOf("function focusPageHeading"));

    assert.match(views, /await loadAndDecodeImage\(targetLayer, item/);
    assert.match(views, /const MAX_DAILY_PREFETCHES = 1;/);
    assert.match(views, /const MAX_DETAIL_NEIGHBOR_PREFETCHES = 4;/);
    assert.match(views, /const SWITCH_INTENT_DELAY_MS = 40;/);
    assert.match(views, /const IMAGE_LOADING_FALLBACK_DELAY_MS = 240;/);
    assert.match(views, /const DETAIL_LAYER_RELEASE_DELAY_MS = 180;/);
    assert.match(views, /state\.detailTargetIndex = targetIndex;[\s\S]*await loadAndDecodeImage[\s\S]*state\.detailIndex = targetIndex;/);
    assert.ok(dailyRequest.indexOf("await waitForSettledSwitchIntent()") < dailyRequest.indexOf("const targetLayer"), "daily target layer must be chosen after rapid intent settles");
    assert.ok(detailRequest.indexOf("await waitForSettledSwitchIntent()") < detailRequest.indexOf("const targetLayer"), "detail target layer must be chosen after rapid intent settles");
    assert.doesNotMatch(dailyRequest, /if \(state\.dailyItem\)\s*\{\s*await waitForSettledSwitchIntent/);
    assert.doesNotMatch(detailRequest, /if \(hasVisibleImage\)\s*\{\s*await waitForSettledSwitchIntent/);
    assert.doesNotMatch(views, /new Image\s*\(/, "switching should reuse the two DOM image layers");
    assert.doesNotMatch(views, /offsetWidth/, "image transitions should not force synchronous layout");
    assert.match(views, /getAnimations\?\.\(\)[\s\S]*transitionProperty === "opacity"[\s\S]*animation\.cancel\(\)/, "a fading layer must become fully hidden before it is reused");
    assert.doesNotMatch(dailyRequest, /setAdjacentPreloads\(\[\]\)/, "daily switching must keep its existing prefetch hint until commit");
    assert.doesNotMatch(detailRequest, /setAdjacentPreloads\(\[\]\)/, "detail switching must keep its existing prefetch hints until commit");
    assert.match(views, /setAdjacentPreloads\(\[dailyDeck\.at\(-1\)\], MAX_DAILY_PREFETCHES\)/, "daily prefetch should stay bounded to the next likely image");
    assert.match(views, /function preloadDetailNeighbors\(index\)[\s\S]*index - 1[\s\S]*index \+ 1[\s\S]*index - 2[\s\S]*index \+ 2/, "detail should prefetch two neighbors in each direction, nearest first");
    assert.match(detailRequest, /releaseInactiveLayer\(outgoing,[\s\S]*DETAIL_LAYER_RELEASE_DELAY_MS\)/, "detail source cleanup must wait until the fade ends");
    assert.match(detailRequest, /cancelImageLoad\(targetLayer, true\)/, "failed detail targets must release broken sources");
    assert.doesNotMatch(dailyRequest, /dailyDeck\.push\(item\)/, "a failed daily image must not become the next target again");
    assert.match(dailyRequest, /dailyDeck = shuffle\(itemsForScope\(dailyCategoryId\)[\s\S]*candidate !== item[\s\S]*高清图加载失败：/, "cold daily failures must prepare another configured target and update the control label");
  });

  it("delays the cold-loading fallback and preserves an existing decoded image", async () => {
    const views = await readFile(path.join(appRoot, "views.js"), "utf8");
    const base = await readFile(path.join(appRoot, "base.css"), "utf8");
    const detailCss = await readFile(path.join(appRoot, "detail.css"), "utf8");
    const dailyRequest = views.slice(views.indexOf("async function requestDailyItem"), views.indexOf("function cancelDailyRequest"));
    const detailRequest = views.slice(views.indexOf("async function requestDetailItem"), views.indexOf("function focusPageHeading"));

    assert.match(views, /function scheduleImageLoadingFallback\([\s\S]*setTimeout\([\s\S]*IMAGE_LOADING_FALLBACK_DELAY_MS/);
    assert.match(views, /function refreshVisibleImageLoadingFallback\([\s\S]*showImagePlaceholder\([\s\S]*return true;/, "a visible cold fallback must update immediately when its target changes");
    assert.ok(dailyRequest.indexOf("scheduleImageLoadingFallback") < dailyRequest.indexOf("await waitForSettledSwitchIntent()"), "daily fallback delay must start from the user action");
    assert.ok(detailRequest.indexOf("scheduleImageLoadingFallback") < detailRequest.indexOf("await waitForSettledSwitchIntent()"), "detail fallback delay must start from the user action");
    assert.doesNotMatch(dailyRequest.slice(0, dailyRequest.indexOf("await loadAndDecodeImage")), /showImagePlaceholder/, "daily ThumbHash must not appear synchronously");
    assert.doesNotMatch(detailRequest.slice(0, detailRequest.indexOf("await loadAndDecodeImage")), /showImagePlaceholder/, "detail ThumbHash must not appear synchronously");
    assert.match(dailyRequest, /const hasVisibleImage =[\s\S]*hasVisibleImage \|\| hasVisibleFallback\s*\? \(\) => \{\}\s*:\s*scheduleImageLoadingFallback/, "an existing daily image must suppress the loading fallback");
    assert.match(detailRequest, /const hasVisibleImage =[\s\S]*hasVisibleImage \|\| hasVisibleFallback\s*\? \(\) => \{\}\s*:\s*scheduleImageLoadingFallback/, "an existing detail image must suppress the loading fallback");
    assert.match(dailyRequest, /const hasVisibleFallback = !hasVisibleImage && refreshVisibleImageLoadingFallback/, "daily cold navigation must keep a visible fallback bound to the current target");
    assert.match(detailRequest, /const hasVisibleFallback = !hasVisibleImage && refreshVisibleImageLoadingFallback/, "detail cold navigation must keep a visible fallback bound to the current target");
    assert.doesNotMatch(dailyRequest, /dailyActiveLayer\?\.setAttribute\("aria-hidden", "true"\)/, "the current daily image must remain accessible while its replacement decodes");
    assert.doesNotMatch(detailRequest.slice(0, detailRequest.indexOf("await loadAndDecodeImage")), /detailActiveLayer\?\.setAttribute\("aria-hidden", "true"\)/, "the current detail image must remain accessible while its replacement decodes");
    assert.ok(detailRequest.indexOf('targetLayer.classList.add("is-active")') < detailRequest.indexOf('outgoing?.setAttribute("aria-hidden", "true")'), "the decoded detail layer must become active before the old layer is hidden");
    assert.match(detailRequest, /if \(!hasVisibleImage\) setDetailAspect\(item\);/, "warm detail switching must retain the current media geometry until commit");
    assert.match(detailRequest, /if \(!hasVisibleImage\)\s*\{[\s\S]*updateDetailMetadata\(item, targetIndex\)/, "only a cold detail load may publish target metadata before decode");
    assert.ok(detailRequest.lastIndexOf("updateDetailMetadata(item, targetIndex)") > detailRequest.indexOf("await loadAndDecodeImage"), "warm detail metadata must update only after decode");
    assert.match(views, /renderThumbHash\(canvas, item\.thumbhash\)/);
    assert.match(detailCss, /\.detail-media\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*aspect-ratio:\s*var\(--detail-aspect/s);
    assert.match(detailCss, /\.detail-media\s*\{[^}]*overflow:\s*hidden;/s);
    assert.doesNotMatch(detailCss, /\.detail-image-wrap\s*\{[^}]*background:/s, "the stable detail stage must not render as an image frame");
    assert.match(views, /const width = Math\.min\(availableWidth, availableHeight \* ratio\);[\s\S]*detailMedia\.style\.width[\s\S]*detailMedia\.style\.height/, "the target media box must fit both available dimensions");
    assert.doesNotMatch(dailyRequest, /setDailyStatus\([^)]*正在加载/, "normal daily loading must not expose a visible loading message");
    assert.doesNotMatch(detailRequest, /setDetailStatus\(loadingMessage\)/, "normal detail loading must not expose a visible loading message");
    assert.match(base, /\.image-load-sweep\.is-sweep-a\s*\{[^}]*animation:[^;}]*infinite;/, "the sweep is the persistent slow-loading indicator");
    assert.doesNotMatch(base, /thumbhash-develop/, "ThumbHash should not animate as a separate loading beat");
    assert.doesNotMatch(detailCss, /\.detail-image-wrap\.is-loading[^}]*\.detail-load-state/, "detail loading must not render a second visible loading treatment");
    assert.match(base, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.image-load-sweep\s*\{\s*display:\s*none;/);
  });

  it("keeps detail loading and pointer feedback scoped to the rendered media", async () => {
    const app = await readFile(path.join(appRoot, "app.js"), "utf8");
    const html = await readFile(path.join(appRoot, "brand.html"), "utf8");
    const detailMedia = html.slice(html.indexOf('<div class="detail-media"'), html.indexOf('<div class="detail-copy"'));

    assert.match(detailMedia, /id="detailLoadSweep"[\s\S]*class="detail-load-state"[\s\S]*id="detailRetry"/, "detail failure controls must remain inside the actual media box");
    assert.match(app, /elements\.detailMedia\.addEventListener\("pointermove"/);
    assert.match(app, /const rect = elements\.detailMedia\.getBoundingClientRect\(\);/);
    assert.match(app, /elements\.detailMedia\.addEventListener\("pointerleave"/);
    assert.doesNotMatch(app, /elements\.detailImageWrap\.addEventListener\("pointer(?:move|leave)"/, "detail copy and surrounding whitespace must not tilt the image");
  });

  it("defers folder cover requests until the archive scene approaches", async () => {
    const views = await readFile(path.join(appRoot, "views.js"), "utf8");
    const home = await readFile(path.join(appRoot, "home.js"), "utf8");
    const app = await readFile(path.join(appRoot, "app.js"), "utf8");

    assert.doesNotMatch(views, /image\.src = definition\.preview/);
    assert.match(home, /function hydrateFolderPreviews\(\)[\s\S]*mainImage\.src = definition\.preview/);
    assert.doesNotMatch(app, /renderDailyItem\(\);/, "routing should decide whether the home image is needed");
  });

  it("keeps the browser module graph on one cache version", async () => {
    for (const file of ["app.js", "home.js", "views.js", "utils.js"]) {
      const source = await readFile(path.join(appRoot, file), "utf8");
      const imports = [...source.matchAll(/from "(\.\/[^\"]+)"/g)].map((match) => match[1]);
      for (const specifier of imports) {
        assert.ok(specifier.endsWith(`?v=${ASSET_VERSION}`), `${file} has an unversioned browser import: ${specifier}`);
      }
    }

    const headers = await readFile(path.join(appRoot, "_headers"), "utf8");
    assert.match(headers, /\/\*\.js[\s\S]*Cache-Control: public, max-age=0, must-revalidate/);
    assert.match(headers, /\/\*\.css[\s\S]*Cache-Control: public, max-age=0, must-revalidate/);
  });
});

function waitForReady(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = serverOutput.match(/is running at http:\/\/\S+:(\d+)/);
      if (match) {
        clearInterval(timer);
        resolve(match[1]);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`server did not become ready. Output:\n${serverOutput}`));
      }
    }, 50);
  });
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

function rawRequest(pathname, hostHeader) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: pathname,
      headers: { Host: hostHeader },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response));
    });
    request.once("error", reject);
    request.end();
  });
}

before(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-test-"));
  for (const [relative, content] of Object.entries(FIXTURE_FILES)) {
    const filePath = path.join(fixtureRoot, relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  server = spawn(process.execPath, ["server.mjs"], {
    cwd: appRoot,
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", ARCHIVE_ROOT: fixtureRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  const port = await waitForReady();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

describe("api/archive", () => {
  it("returns the fixture archive with correct shape and ordering", async () => {
    const response = await fetchWithRetry(`${baseUrl}/api/archive`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const data = await response.json();

    assert.equal(data.archive, "trend-lab");
    assert.ok(!Number.isNaN(Date.parse(data.updatedAt)));
    assert.equal(data.days.length, 2);

    const [latest, older] = data.days;
    assert.equal(latest.date, "2026-08-17");
    assert.equal(latest.count, 1);
    assert.equal(latest.items.length, 1);

    const moonlight = latest.items[0];
    assert.equal(moonlight.id, `${dreamscape.id}/interesting-04-moonlight-diner-double-sunrise.png`);
    assert.equal(moonlight.category, dreamscape.id);
    assert.equal(moonlight.categoryLabel, dreamscape.label);
    assert.equal(moonlight.title, "Moonlight Diner Double Sunrise");
    assert.equal(moonlight.src, `/media/2026-08-17/${dreamscape.id}/interesting-04-moonlight-diner-double-sunrise.png`);
    assert.equal(moonlight.bytes, Buffer.byteLength("moonlight fixture bytes"));

    assert.equal(older.date, "2026-08-08");
    assert.equal(older.count, 1);
    assert.equal(older.items[0].title, "Night Market");
    assert.equal(older.items[0].categoryLabel, lens.label);
  });

  it("reports unreadable category directories instead of treating them as empty", async () => {
    const categoryRoot = path.join(fixtureRoot, dreamscape.id);
    await chmod(categoryRoot, 0o000);
    try {
      const response = await fetchWithRetry(`${baseUrl}/api/archive`);
      assert.equal(response.status, 500);
    } finally {
      await chmod(categoryRoot, 0o755);
    }
  });
});

describe("request parsing", () => {
  it("keeps serving archive requests when Host is malformed", async () => {
    const malformedHost = await rawRequest("/api/archive", "[::1");
    assert.equal(malformedHost.statusCode, 200);

    const healthyRequest = await fetchWithRetry(`${baseUrl}/api/archive`);
    assert.equal(healthyRequest.status, 200);
  });

  it("returns 400 for an invalid request URL", async () => {
    const malformedUrl = await rawRequest("http://[", "localhost");
    assert.equal(malformedUrl.statusCode, 400);
  });
});

describe("systems motion interaction layering", () => {
  it("does not let the sticky systems deck intercept archive clicks", async () => {
    const css = await readFile(path.join(appRoot, "systems.css"), "utf8");
    assert.match(css, /\.motion-ready \.home-continuation\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(css, /\.motion-ready \.systems-story\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(css, /\.motion-ready \.systems-deck\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(css, /\.motion-ready \.project-sheet,\s*\.motion-ready \.systems-contact\s*\{[^}]*pointer-events:\s*auto;/s);
  });
});

describe("home page", () => {
  it("exposes every category portal and loads the single entry script and stylesheet", async () => {
    const response = await fetchWithRetry(`${baseUrl}/`);
    assert.equal(response.status, 200);
    if (process.env.SITE_PROFILE === "owner") assert.match(response.url, /\/brand\.html\?profile=owner$/);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();

    assert.equal(categoryDefinitions.length, 4);
    assert.equal((html.match(/class="folder-portal"/g) || []).length, 4);
    assert.equal((html.match(/data-project-sheet/g) || []).length, 3);
    assert.ok(html.includes(`<script type="module" src="/app.js?v=${ASSET_VERSION}">`), "expected versioned /app.js module entry");
    assert.ok(!html.includes("media.shanzoon.art"), "personal media URLs should live only in site.config.js and archive.json");
    assert.ok(html.includes('id="siteLogo"'), "expected a configurable logo slot");
    assert.match(html, /<img alt="" loading="lazy" decoding="async" \/>/, "collection images should remain lazy-loaded");
    assert.ok(html.includes('id="collectionMore"'), "expected a manual archive pagination control");
    assert.ok(html.includes('id="collectionFilters"'), "expected a collection category filter control");
    assert.ok(html.includes('id="dailyRefresh"'), "expected a daily pick refresh control");
    const archiveCuePattern = /<div class="scroll-cue" id="scrollCue" aria-hidden="true">\s*<span class="scroll-cue-label">ENTER ARCHIVE<\/span>\s*<span class="scroll-cue-mouse"><\/span>\s*<\/div>/g;
    assert.equal(html.match(archiveCuePattern)?.length, 1, "one complete scroll cue component should serve both archive transitions");
    assert.ok(!html.includes('id="archiveScrollCue"'), "archive transitions should not fork the scroll cue component");
    assert.ok(html.indexOf('id="homeStatus"') < html.indexOf('id="folderPortals"'), "daily feedback should stay inside the artwork before archive controls");
    assert.match(html, /<\/div>\s*<div class="scroll-cue" id="scrollCue"/, "the scroll cue should sit outside the scaled stage");
    assert.ok(!html.includes('id="detailStrip"'), "detail page should not render the old thumbnail strip");
    assert.ok(!html.includes('class="detail-browser"'), "detail page should not render the old thumbnail browser");
    assert.ok(html.includes('class="detail-nav previous"'), "detail page should expose the previous image control");
    assert.ok(html.includes('class="detail-nav next"'), "detail page should expose the next image control");
    assert.ok(html.includes('id="detailImageIncoming"'), "detail switching should have a reusable decoded incoming layer");
    assert.ok(html.includes('id="dailyPlaceholder"'), "daily switching should expose a ThumbHash canvas");
    assert.ok(html.includes('id="detailPlaceholder"'), "detail switching should expose a ThumbHash canvas");
    assert.ok(html.includes('id="detailMedia"'), "detail switching should expose one target-sized media box");
    assert.match(html, /<div class="detail-media"[^>]*>[\s\S]*id="detailImage"[\s\S]*id="detailPlaceholder"[\s\S]*id="detailLoadSweep"[\s\S]*<\/div>/, "detail image, placeholder, and sweep must share one media box");
    assert.doesNotMatch(html, /class="daily-layer is-active"[^>]*id="dailyImage"/, "an empty daily layer must not start visible");
    assert.ok(html.includes('id="detailRetry"'), "detail failures should expose a retry control");
    assert.ok(html.includes('id="detailLiveStatus"'), "detail feedback should expose a live region outside the busy image wrapper");
    assert.ok(html.indexOf('id="detailPrevious"') < html.indexOf('class="detail-layout"'), "detail navigation should sit outside the artwork layout");
    const stylesheetOrder = ["/base.css", "/home.css", "/systems.css", "/collection.css", "/detail.css"];
    const styleIndexes = stylesheetOrder.map((href) => html.indexOf(`href="${href}?v=${ASSET_VERSION}"`));
    for (let index = 0; index < styleIndexes.length; index += 1) {
      assert.ok(styleIndexes[index] !== -1, `expected stylesheet link to ${stylesheetOrder[index]}`);
      if (index > 0) assert.ok(styleIndexes[index] > styleIndexes[index - 1], `${stylesheetOrder[index]} must come after ${stylesheetOrder[index - 1]}`);
    }
  });
});

describe("static assets", () => {
  it("serves every core whitelisted file", async () => {
    const coreAssets = [
      "/base.css",
      "/home.css",
      "/systems.css",
      "/collection.css",
      "/detail.css",
      "/archive.json",
      "/archive.example.json",
      "/categories.js",
      "/site.config.js",
      "/site.config.owner.js",
      "/site-profile.js",
      "/site.js",
      "/app.js",
      "/views.js",
      "/home.js",
      "/elements.js",
      "/state.js",
      "/media.js",
      "/timelines.js",
      "/thumbhash.js",
      "/utils.js",
      "/assets/shanzoon-glyph.svg",
      "/assets/shanzoon-glyph-favicon.svg",
      "/assets/example-logo.svg",
      "/assets/example-dreamscape.svg",
    ];
    for (const asset of coreAssets) {
      const response = await fetchWithRetry(`${baseUrl}${asset}`);
      assert.equal(response.status, 200, `${asset} should be served`);
    }
  });

  it("keeps the owner archive ThumbHashes decodable", async () => {
    const archive = JSON.parse(await readFile(path.join(appRoot, "archive.json"), "utf8"));
    const items = archive.days.flatMap((day) => day.items);
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => typeof item.thumbhash === "string" && item.thumbhash.length > 0));
    for (const item of items) {
      const decoded = decodeLocalThumbHash(Buffer.from(item.thumbhash, "base64"));
      assert.ok(decoded.width > 0 && decoded.height > 0, `invalid ThumbHash dimensions for ${item.id}`);
      assert.equal(decoded.rgba.length, decoded.width * decoded.height * 4);
    }
  });

  it("serves the archive manifest selected by site.config.js", async () => {
    const response = await fetchWithRetry(`${baseUrl}${siteConfig.archive.manifestPath}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const archive = await response.json();
    const items = archive.days.flatMap((day) => day.items);
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => typeof item.src === "string" && Boolean(new URL(item.src, baseUrl))));
    assert.ok(items.every((item) => Number.isInteger(item.width) && item.width > 0));
    assert.ok(items.every((item) => Number.isInteger(item.height) && item.height > 0));
  });

  it("serves configurable local assets and rejects traversal", async () => {
    const image = await fetchWithRetry(`${baseUrl}/assets/example-project-one.svg`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image\/svg\+xml/);
    const traversal = await fetchWithRetry(`${baseUrl}/assets/%2e%2e/package.json`);
    assert.ok([400, 404].includes(traversal.status));
  });
});

describe("static deployment entry", () => {
  it("provides an index.html fallback for hosts that do not apply vercel.json", async () => {
    const response = await fetchWithRetry(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /location\.replace\(`\/brand\.html/);
  });
});

describe("media endpoint", () => {
  it("serves a valid fixture image", async () => {
    const response = await fetchWithRetry(`${baseUrl}/media/2026-08-08/${lens.id}/hottest-01-night-market.png`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    const body = await response.arrayBuffer();
    assert.equal(Buffer.from(body).toString(), "night market fixture bytes");
  });

  it("rejects invalid and traversal paths", async () => {
    for (const badPath of [
      "/media/nope",
      `/media/2026-08-08/${lens.id}/..%2Fhottest-01-night-market.png`,
      `/media/2026-08-08/${lens.id}/%2e%2e/hottest-01-night-market.png`,
    ]) {
      const response = await fetchWithRetry(`${baseUrl}${badPath}`);
      assert.equal(response.status, 400, `${badPath} should be rejected`);
    }
  });
});

describe("method and missing routes", () => {
  it("rejects non-GET and unknown paths", async () => {
    const post = await fetchWithRetry(`${baseUrl}/api/archive`, { method: "POST" });
    assert.equal(post.status, 405);
    const missing = await fetchWithRetry(`${baseUrl}/no-such-file`);
    assert.equal(missing.status, 404);
  });
});
