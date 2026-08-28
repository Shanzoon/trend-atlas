#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { categoryDefinitions } from "../categories.js";
import { siteConfig } from "../site-profile.js";
import { validateSiteConfig } from "../site.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(appRoot, "archive.json");
const PUBLISH_LOCK_PATH = path.join(appRoot, ".publish-images.lock");
const WEBP_QUALITY = 84;
const sourceFilePattern = /^(\d{4}-\d{2}-\d{2})__(.+)\.png$/i;
const titlePrefixPattern = /^(?:interesting|hottest|niche|character|illustration|import)-\d+-/;

export function parseSourceFile(file) {
  const match = file.match(sourceFilePattern);
  if (!match) return null;
  const [, date, stem] = match;
  return { date, sourceFile: file, webpFile: `${stem}.webp` };
}

export function resolvePublishingConfig(config = siteConfig, env = process.env) {
  const publishing = config?.publishing || {};
  const sourceRoot = env.ARCHIVE_ROOT || publishing.sourceRoot;
  const bucket = env.R2_BUCKET || publishing.bucket;
  const mediaOrigin = env.MEDIA_ORIGIN || publishing.mediaOrigin;
  const missing = [
    [sourceRoot, "publishing.sourceRoot（或 ARCHIVE_ROOT）"],
    [bucket, "publishing.bucket（或 R2_BUCKET）"],
    [mediaOrigin, "publishing.mediaOrigin（或 MEDIA_ORIGIN）"],
  ].filter(([value]) => typeof value !== "string" || !value.trim()).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`图片发布尚未配置：请设置 ${missing.join("、")}。不要把 Cloudflare 令牌写入仓库。`);
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(mediaOrigin);
  } catch {
    throw new Error("图片发布配置错误：mediaOrigin 必须是完整的 http(s) URL。");
  }
  if (!/^https?:$/.test(parsedOrigin.protocol)) throw new Error("图片发布配置错误：mediaOrigin 必须使用 http 或 https。");
  if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.pathname !== "/") {
    throw new Error("图片发布配置错误：mediaOrigin 只能填写公开 origin（例如 https://media.example.com），不能包含凭证、路径、查询参数或片段。");
  }

  return {
    sourceRoot: path.resolve(appRoot, sourceRoot),
    bucket: bucket.trim(),
    mediaOrigin: parsedOrigin.origin,
  };
}

export function publicUrlFor(category, sourceFile, mediaOrigin = resolvePublishingConfig().mediaOrigin) {
  const parsed = parseSourceFile(sourceFile);
  if (!parsed) throw new Error(`Unsupported source filename: ${sourceFile}`);
  return `${mediaOrigin.replace(/\/$/, "")}/${encodeURIComponent(category)}/${encodeURIComponent(`${parsed.date}__${parsed.webpFile}`)}`;
}

function titleFromFile(file) {
  return file
    .replace(/\.webp$/i, "")
    .replace(titlePrefixPattern, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildArchive(items, updatedAt = new Date().toISOString()) {
  const itemsByDate = new Map();
  for (const item of items) {
    const dayItems = itemsByDate.get(item.date) || [];
    dayItems.push({
      id: `${item.category}/${item.webpFile}`,
      category: item.category,
      categoryLabel: item.categoryLabel,
      file: item.webpFile,
      title: titleFromFile(item.webpFile),
      bytes: item.bytes,
      width: item.width,
      height: item.height,
      src: item.url,
      ...(item.thumbhash ? { thumbhash: item.thumbhash } : {}),
    });
    itemsByDate.set(item.date, dayItems);
  }

  const days = [...itemsByDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, dayItems]) => ({
      date,
      count: dayItems.length,
      items: dayItems.sort((left, right) => left.category.localeCompare(right.category) || left.file.localeCompare(right.file)),
    }));

  return { archive: "trend-lab", updatedAt, days };
}

export async function resolveSourceCategoryRoot(sourceRoot, categoryId) {
  const configuredRoot = path.resolve(sourceRoot);
  const categoryRoot = path.resolve(configuredRoot, categoryId);
  if (!categoryRoot.startsWith(`${configuredRoot}${path.sep}`)) {
    throw new Error(`分类目录越出图片源根目录：${categoryId}`);
  }
  let actualRoot;
  try {
    actualRoot = await realpath(configuredRoot);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`图片源目录不存在：${configuredRoot}`);
    throw error;
  }
  try {
    if ((await lstat(categoryRoot)).isSymbolicLink()) throw new Error(`图片源分类目录不能是符号链接：${categoryRoot}`);
    const actualCategoryRoot = await realpath(categoryRoot);
    if (!actualCategoryRoot.startsWith(`${actualRoot}${path.sep}`)) {
      throw new Error(`分类目录越出图片源根目录：${categoryId}`);
    }
    return actualCategoryRoot;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`图片源分类目录不存在：${categoryRoot}。请检查 publishing.sourceRoot 和分类目录。`);
    throw error;
  }
}

async function scanSources(settings) {
  const items = [];
  const keys = new Set();

  for (const definition of categoryDefinitions) {
    const categoryRoot = await resolveSourceCategoryRoot(settings.sourceRoot, definition.id);
    let entries;
    try {
      entries = await readdir(categoryRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`图片源分类目录不存在：${categoryRoot}。请检查 publishing.sourceRoot 和分类目录。`);
      throw error;
    }
    for (const entry of entries.filter((candidate) => candidate.isFile()).sort((left, right) => left.name.localeCompare(right.name))) {
      const parsed = parseSourceFile(entry.name);
      if (!parsed) continue;
      const key = `${definition.id}/${parsed.date}__${parsed.webpFile}`;
      if (keys.has(key)) throw new Error(`Duplicate R2 key: ${key}`);
      keys.add(key);
      const sourcePath = path.join(categoryRoot, entry.name);
      const { width, height } = await sharp(sourcePath).metadata();
      if (!width || !height) throw new Error(`Unable to read image dimensions: ${sourcePath}`);
      items.push({
        ...parsed,
        category: definition.id,
        categoryLabel: definition.label,
        key,
        sourcePath,
        width,
        height,
        url: publicUrlFor(definition.id, entry.name, settings.mediaOrigin),
      });
    }
  }

  return items;
}

export async function createThumbHash(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .rotate()
    .resize({ width: 100, height: 100, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

export function isThumbHashString(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length >= 5 && bytes.toString("base64") === value;
}

function previousThumbHashes(archive) {
  return new Map((archive?.days || []).flatMap((day) => day.items || [])
    .filter((item) => item.src && isThumbHashString(item.thumbhash))
    .map((item) => [item.src, item.thumbhash]));
}

export async function prepareThumbHashes(items, previous) {
  const previousBySrc = previousThumbHashes(previous);
  let generated = 0;
  let preserved = 0;
  await mapLimit(items, 4, async (item) => {
    const existing = previousBySrc.get(item.url);
    if (existing) {
      item.thumbhash = existing;
      preserved += 1;
      return;
    }
    try {
      item.thumbhash = await createThumbHash(item.sourcePath);
      generated += 1;
    } catch (error) {
      throw new Error(`Unable to create ThumbHash for ${item.key}: ${error.message}`);
    }
  });
  return { generated, preserved };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function probeRemote(item, index) {
  const probeUrl = `${item.url}?publish-probe=${Date.now()}-${index}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(probeUrl, { method: "HEAD" });
      if (response.status === 404) return { exists: false };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (!type.startsWith("image/webp")) throw new Error(`unexpected content type ${type || "missing"}`);
      return { exists: true, bytes: Number(response.headers.get("content-length")) };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error(`Unable to inspect ${item.url}: ${lastError.message}`);
}

function runWrangler(args) {
  const executable = path.join(appRoot, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (!existsSync(executable)) throw new Error("Wrangler is not installed. Run npm install first.");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.trim() || `Wrangler exited with code ${code}`));
    });
  });
}

async function inspectR2Object(item, settings) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-r2-inspect-"));
  const outputPath = path.join(temporaryRoot, "object");
  try {
    await runWrangler([
      "r2", "object", "get", `${settings.bucket}/${item.key}`,
      "--file", outputPath,
      "--remote",
    ]);
    return { exists: true, bytes: (await stat(outputPath)).size };
  } catch (error) {
    if (/specified key does not exist/i.test(error.message)) return { exists: false };
    throw error;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function confirmMissingObjects(items, statuses, previous, inspect) {
  if (typeof inspect !== "function") throw new Error("R2 verification requires an authenticated object inspector.");
  const historicalUrls = new Set((previous?.days || []).flatMap((day) => day.items || [])
    .map((item) => item.src)
    .filter(Boolean));
  const confirmed = statuses.map((status) => ({ ...status }));
  const missingIndexes = items.map((item, index) => ({ item, index }))
    .filter(({ index }) => !confirmed[index].exists);

  await mapLimit(missingIndexes, 2, async ({ item, index }) => {
    let directStatus;
    try {
      directStatus = await inspect(item);
    } catch (error) {
      throw new Error(`Unable to verify R2 object ${item.key}; refusing to publish: ${error.message}`);
    }
    if (!directStatus.exists) return;
    if (!historicalUrls.has(item.url)) {
      throw new Error(`R2 object ${item.key} exists outside archive.json; refusing to overwrite or index unknown content.`);
    }
    confirmed[index] = directStatus;
  });
  return confirmed;
}

export async function assertR2ObjectAbsent(item, inspect) {
  if (typeof inspect !== "function") throw new Error("R2 upload recheck requires an authenticated object inspector.");
  let directStatus;
  try {
    directStatus = await inspect(item);
  } catch (error) {
    throw new Error(`Unable to recheck R2 object ${item.key}; refusing to upload: ${error.message}`);
  }
  if (directStatus.exists) throw new Error(`R2 object ${item.key} appeared before upload; refusing to overwrite it.`);
}

export async function acquirePublishLock(lockPath = PUBLISH_LOCK_PATH) {
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
  } catch (error) {
    if (handle) {
      await handle.close();
      await rm(lockPath, { force: true });
    }
    if (error.code === "EEXIST") {
      throw new Error(`Another image publish is already running (${lockPath}). If no publisher is active, remove the stale lock and retry.`);
    }
    throw error;
  }

  return async () => {
    await handle.close();
    await rm(lockPath, { force: true });
  };
}

async function upload(item, webpPath, settings) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await runWrangler([
        "r2", "object", "put", `${settings.bucket}/${item.key}`,
        "--file", webpPath,
        "--content-type", "image/webp",
        "--cache-control", "public, max-age=31536000, immutable",
        "--remote",
      ]);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Unable to upload ${item.key}: ${lastError.message}`);
}

async function verifyUploaded(item) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(item.url, { method: "HEAD", cache: "no-store" });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.startsWith("image/webp")) throw new Error(`HTTP ${response.status}, ${type || "missing type"}`);
      return Number(response.headers.get("content-length"));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Unable to verify ${item.url}: ${lastError.message}`);
}

async function writeManifest(items) {
  let previous;
  try {
    previous = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const archive = buildArchive(items, previous?.updatedAt);
  if (previous && JSON.stringify(previous.days) === JSON.stringify(archive.days)) return false;
  archive.updatedAt = new Date().toISOString();
  const temporaryPath = `${MANIFEST_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(archive, null, 2)}\n`);
  await rename(temporaryPath, MANIFEST_PATH);
  return true;
}

export async function main(args = process.argv.slice(2)) {
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((argument) => argument !== "--dry-run");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  validateSiteConfig(siteConfig);
  const settings = resolvePublishingConfig();
  const releasePublishLock = dryRun ? null : await acquirePublishLock();
  try {
    let previous;
    try {
      previous = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const items = await scanSources(settings);
    const [publicStatuses, thumbhashes] = await Promise.all([
      mapLimit(items, 12, probeRemote),
      prepareThumbHashes(items, previous),
    ]);
    const inspect = (item) => inspectR2Object(item, settings);
    const statuses = await confirmMissingObjects(items, publicStatuses, previous, inspect);
    const missing = items.filter((_, index) => !statuses[index].exists);

    console.log(`Found ${items.length} source PNGs; ${missing.length} new image(s).`);
    console.log(`Prepared ${items.length} ThumbHashes (${thumbhashes.generated} generated, ${thumbhashes.preserved} preserved).`);
    if (dryRun) {
      for (const item of missing) console.log(`Would upload ${item.key}`);
      return { found: items.length, uploaded: 0, missing: missing.length, dryRun: true, thumbhashes };
    }

    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-publish-"));
    try {
      for (let index = 0; index < items.length; index += 1) {
        if (statuses[index].exists) {
          items[index].bytes = statuses[index].bytes;
          continue;
        }
        const item = items[index];
        const webpPath = path.join(temporaryRoot, item.key);
        await mkdir(path.dirname(webpPath), { recursive: true });
        await sharp(item.sourcePath).webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true }).toFile(webpPath);
        await assertR2ObjectAbsent(item, inspect);
        await upload(item, webpPath, settings);
        item.bytes = await verifyUploaded(item);
        console.log(`Uploaded ${item.key}`);
      }
      const manifestChanged = await writeManifest(items);
      console.log(`Verified ${items.length} images. archive.json ${manifestChanged ? "updated" : "unchanged"}.`);
      return { found: items.length, uploaded: missing.length, missing: 0, dryRun: false, manifestChanged };
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  } finally {
    if (releasePublishLock) await releasePublishLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
