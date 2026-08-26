#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { categoryDefinitions } from "../categories.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.resolve(process.env.ARCHIVE_ROOT || path.join(appRoot, "..", "trend-lab"));
const MANIFEST_PATH = path.join(appRoot, "archive.json");
const BUCKET = "shanzoon-me-art-image";
const MEDIA_ORIGIN = "https://media.shanzoon.art";
const WEBP_QUALITY = 84;
const sourceFilePattern = /^(\d{4}-\d{2}-\d{2})__(.+)\.png$/i;
const titlePrefixPattern = /^(?:interesting|hottest|niche|character|illustration|import)-\d+-/;

export function parseSourceFile(file) {
  const match = file.match(sourceFilePattern);
  if (!match) return null;
  const [, date, stem] = match;
  return { date, sourceFile: file, webpFile: `${stem}.webp` };
}

export function publicUrlFor(category, sourceFile) {
  const parsed = parseSourceFile(sourceFile);
  if (!parsed) throw new Error(`Unsupported source filename: ${sourceFile}`);
  return `${MEDIA_ORIGIN}/${encodeURIComponent(category)}/${encodeURIComponent(`${parsed.date}__${parsed.webpFile}`)}`;
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

async function scanSources() {
  const items = [];
  const keys = new Set();

  for (const definition of categoryDefinitions) {
    const categoryRoot = path.join(SOURCE_ROOT, definition.id);
    const entries = await readdir(categoryRoot, { withFileTypes: true });
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
        url: publicUrlFor(definition.id, entry.name),
      });
    }
  }

  return items;
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

async function upload(item, webpPath) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await runWrangler([
        "r2", "object", "put", `${BUCKET}/${item.key}`,
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

  const items = await scanSources();
  const statuses = await mapLimit(items, 12, probeRemote);
  const missing = items.filter((_, index) => !statuses[index].exists);

  console.log(`Found ${items.length} source PNGs; ${missing.length} new image(s).`);
  if (dryRun) {
    for (const item of missing) console.log(`Would upload ${item.key}`);
    return { found: items.length, uploaded: 0, missing: missing.length, dryRun: true };
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
      await upload(item, webpPath);
      item.bytes = await verifyUploaded(item);
      console.log(`Uploaded ${item.key}`);
    }
    const manifestChanged = await writeManifest(items);
    console.log(`Verified ${items.length} images. archive.json ${manifestChanged ? "updated" : "unchanged"}.`);
    return { found: items.length, uploaded: missing.length, missing: 0, dryRun: false, manifestChanged };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
