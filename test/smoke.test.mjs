import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryDefinitions } from "../categories.js";
import { COLLECTION_PAGE_SIZE, nextCollectionPageEnd } from "../state.js";
import { progressWithHold, progressWithHolds, systemsTimeline } from "../timelines.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

describe("collection pagination", () => {
  it("reveals archive images in bounded pages", () => {
    const total = 287;
    assert.equal(nextCollectionPageEnd(0, total), COLLECTION_PAGE_SIZE);
    assert.equal(nextCollectionPageEnd(COLLECTION_PAGE_SIZE, total), COLLECTION_PAGE_SIZE * 2);
    assert.equal(nextCollectionPageEnd(280, total), total);
    assert.equal(nextCollectionPageEnd(total, total), total);
  });
});

function waitForReady(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = serverOutput.match(/Shanzoon is running at http:\/\/\S+:(\d+)/);
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
});

describe("home page", () => {
  it("exposes every category portal and loads the single entry script and stylesheet", async () => {
    const response = await fetchWithRetry(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();

    for (const definition of categoryDefinitions) {
      assert.ok(html.includes(`data-category="${definition.id}"`), `missing folder portal for ${definition.id}`);
      assert.ok(definition.cover.startsWith("https://media.shanzoon.art/"));
      assert.equal(definition.preview, definition.cover);
    }
    for (const image of ["project-lingjing-ai.webp", "project-drama-data.webp", "project-loomicc-card-v2.webp"]) {
      assert.ok(html.includes(`https://media.shanzoon.art/site-assets/${image}`), `missing R2 product image ${image}`);
    }
    assert.ok(html.includes('<script type="module" src="/app.js">'), "expected /app.js module entry");
    assert.match(html, /<img alt="" loading="lazy" decoding="async" \/>/, "collection images should remain lazy-loaded");
    assert.ok(html.includes('id="collectionMore"'), "expected a manual archive pagination control");
    assert.ok(html.includes('id="dailyRefresh"'), "expected a daily pick refresh control");
    assert.ok(!html.includes('id="detailStrip"'), "detail page should not render the old thumbnail strip");
    assert.ok(!html.includes('class="detail-browser"'), "detail page should not render the old thumbnail browser");
    const stylesheetOrder = ["/base.css", "/home.css", "/systems.css", "/collection.css", "/detail.css"];
    const styleIndexes = stylesheetOrder.map((href) => html.indexOf(`href="${href}"`));
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
      "/categories.js",
      "/app.js",
      "/views.js",
      "/home.js",
      "/elements.js",
      "/state.js",
      "/media.js",
      "/timelines.js",
      "/utils.js",
      "/assets/shanzoon-glyph.svg",
      "/assets/shanzoon-glyph-favicon.svg",
    ];
    for (const asset of coreAssets) {
      const response = await fetchWithRetry(`${baseUrl}${asset}`);
      assert.equal(response.status, 200, `${asset} should be served`);
    }
  });

  it("serves the published R2 archive manifest", async () => {
    const response = await fetchWithRetry(`${baseUrl}/archive.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const archive = await response.json();
    const items = archive.days.flatMap((day) => day.items);
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => item.src.startsWith("https://media.shanzoon.art/")));
    assert.ok(items.every((item) => item.src.endsWith(".webp")));
  });

  it("serves local content images and 404s for gitignored ones", async () => {
    const contentImages = [
      "/assets/project-drama-data.png",
      "/assets/project-lingjing-ai.png",
      "/assets/project-loomicc-card-v2.png",
    ];
    for (const image of contentImages) {
      const expected = existsSync(path.join(appRoot, image)) ? 200 : 404;
      const response = await fetchWithRetry(`${baseUrl}${image}`);
      assert.equal(response.status, expected, `${image} should be ${expected} (content assets are gitignored)`);
    }
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
