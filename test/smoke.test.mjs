import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FIXTURE_FILES = {
  "01-interesting/2026-08-17/interesting-04-moonlight-diner-double-sunrise.png": "moonlight fixture bytes",
  "02-hottest/2026-08-08/hottest-01-night-market.png": "night market fixture bytes",
};

let server;
let serverOutput = "";
let baseUrl;
let fixtureRoot;

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
    assert.equal(moonlight.id, "01-interesting/interesting-04-moonlight-diner-double-sunrise.png");
    assert.equal(moonlight.category, "01-interesting");
    assert.equal(moonlight.categoryLabel, "有趣");
    assert.equal(moonlight.title, "Moonlight Diner Double Sunrise");
    assert.equal(moonlight.src, "/media/2026-08-17/01-interesting/interesting-04-moonlight-diner-double-sunrise.png");
    assert.equal(moonlight.bytes, Buffer.byteLength("moonlight fixture bytes"));

    assert.equal(older.date, "2026-08-08");
    assert.equal(older.count, 1);
    assert.equal(older.items[0].title, "Night Market");
    assert.equal(older.items[0].categoryLabel, "最热");
  });
});

describe("home page", () => {
  it("exposes every category portal and loads the single entry script and stylesheet", async () => {
    const response = await fetchWithRetry(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();

    for (const id of ["01-interesting", "02-hottest", "03-niche", "04-best-character"]) {
      assert.ok(html.includes(`data-category="${id}"`), `missing folder portal for ${id}`);
    }
    assert.ok(html.includes('<script type="module" src="/brand.js">'), "expected /brand.js module entry");
    assert.ok(html.includes('href="/brand.css"'), "expected /brand.css stylesheet");
  });
});

describe("static assets", () => {
  it("serves every whitelisted file", async () => {
    const assets = [
      "/brand.css",
      "/brand.js",
      "/assets/shanzoon-glyph.svg",
      "/assets/shanzoon-glyph-favicon.svg",
      "/assets/project-drama-data.png",
      "/assets/project-lingjing-ai.png",
      "/assets/project-loomicc-local-dashboard.jpg",
      "/assets/folder-wonder.jpg",
      "/assets/folder-current.jpg",
      "/assets/folder-underground.jpg",
      "/assets/folder-persona.jpg",
    ];
    for (const asset of assets) {
      const response = await fetchWithRetry(`${baseUrl}${asset}`);
      assert.equal(response.status, 200, `${asset} should be served`);
    }
  });
});

describe("media endpoint", () => {
  it("serves a valid fixture image", async () => {
    const response = await fetchWithRetry(`${baseUrl}/media/2026-08-08/02-hottest/hottest-01-night-market.png`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    const body = await response.arrayBuffer();
    assert.equal(Buffer.from(body).toString(), "night market fixture bytes");
  });

  it("rejects invalid and traversal paths", async () => {
    for (const badPath of [
      "/media/nope",
      "/media/2026-08-08/02-hottest/..%2Fhottest-01-night-market.png",
      "/media/2026-08-08/02-hottest/%2e%2e/hottest-01-night-market.png",
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
