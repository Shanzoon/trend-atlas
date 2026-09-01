import http from "node:http";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categories } from "./categories.js";
import { siteConfig, siteProfile } from "./site-profile.js";
import { validateSiteConfig } from "./site.js";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
validateSiteConfig(siteConfig);
const archiveRoot = path.resolve(appRoot, process.env.ARCHIVE_ROOT || siteConfig.publishing?.sourceRoot || path.join("..", "trend-lab"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

// 分类文件夹名已是英文（01-Dreamscape …），不再携带旧前缀；文件名里的
// interesting/hottest/niche/character/illustration/import 属于磁盘命名旧前缀，标题仍需剥离。
const titlePrefixPattern = /^(?:interesting|hottest|niche|character|illustration|import)-\d+-/;
const flatArchiveFilePattern = /^(\d{4}-\d{2}-\d{2})__(.+\.(?:png|jpe?g|webp))$/i;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function titleFromFile(file) {
  return file
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .replace(titlePrefixPattern, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function getArchive() {
  const itemsByDate = new Map();

  for (const [folder, label] of Object.entries(categories)) {
    const configuredCategoryRoot = path.resolve(archiveRoot, folder);
    if (!configuredCategoryRoot.startsWith(`${archiveRoot}${path.sep}`)) throw new Error(`分类目录越出归档根目录：${folder}`);
    let categoryRoot;
    try {
      if ((await lstat(configuredCategoryRoot)).isSymbolicLink()) throw new Error(`归档分类目录不能是符号链接：${configuredCategoryRoot}`);
      const [actualRoot, actualCategoryRoot] = await Promise.all([realpath(archiveRoot), realpath(configuredCategoryRoot)]);
      if (!actualCategoryRoot.startsWith(`${actualRoot}${path.sep}`)) throw new Error(`分类目录越出归档根目录：${folder}`);
      categoryRoot = actualCategoryRoot;
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    let entries = [];
    try {
      entries = await readdir(categoryRoot, { withFileTypes: true });
    } catch (error) {
      // A missing category is equivalent to an empty category; other filesystem
      // failures must reach the request handler instead of looking like no data.
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries.filter((candidate) => candidate.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      const match = entry.name.match(flatArchiveFilePattern);
      if (!match) continue;
      const [, date, file] = match;
      const details = await stat(path.join(categoryRoot, entry.name));
      const items = itemsByDate.get(date) || [];
      items.push({
        id: `${folder}/${file}`,
        category: folder,
        categoryLabel: label,
        file,
        title: titleFromFile(file),
        bytes: details.size,
        src: `/media/${encodeURIComponent(date)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
      });
      itemsByDate.set(date, items);
    }
  }

  const days = [...itemsByDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, count: items.length, items }));
  return { archive: "trend-lab", updatedAt: new Date().toISOString(), days };
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    // The local server favors edit/refresh clarity; production caching belongs
    // to the static host and object storage configuration.
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function serveFile(response, filePath) {
  try {
    const body = await readFile(filePath);
    send(response, 200, body, mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  } catch {
    send(response, 404, "Not found");
  }
}

async function safeMediaPath(pathname) {
  let parts;
  try {
    parts = pathname.slice("/media/".length).split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
  const [date, category, file] = parts;
  if (
    parts.length !== 3
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Object.hasOwn(categories, category)
    || !file
    || file === "."
    || file === ".."
    || file.includes("/")
    || file.includes("\\")
    || !/\.(png|jpe?g|webp)$/i.test(file)
  ) {
    return null;
  }
  const resolved = path.resolve(archiveRoot, category, `${date}__${file}`);
  if (!resolved.startsWith(`${archiveRoot}${path.sep}`)) return null;

  const components = [
    path.join(archiveRoot, category),
    resolved,
  ];
  for (const component of components) {
    try {
      if ((await lstat(component)).isSymbolicLink()) return null;
    } catch (error) {
      if (error.code === "ENOENT") return resolved;
      return null;
    }
  }

  try {
    const [actualRoot, actualFile] = await Promise.all([realpath(archiveRoot), realpath(resolved)]);
    return actualFile.startsWith(`${actualRoot}${path.sep}`) ? resolved : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  let url;
  try {
    // Request Host is untrusted input and is unnecessary for routing.
    url = new URL(request.url || "/", "http://localhost");
  } catch {
    send(response, 400, "Invalid request URL");
    return;
  }

  if (request.method !== "GET") {
    send(response, 405, "Method not allowed");
    return;
  }

  if (siteProfile === "owner" && (url.pathname === "/" || url.pathname === "/brand.html") && !url.searchParams.has("profile")) {
    url.pathname = "/brand.html";
    url.searchParams.set("profile", "owner");
    response.writeHead(302, { Location: `${url.pathname}${url.search}`, "Cache-Control": "no-cache" });
    response.end();
    return;
  }

  if (url.pathname === "/api/archive") {
    try {
      send(response, 200, JSON.stringify(await getArchive()), "application/json; charset=utf-8");
    } catch (error) {
      send(response, 500, JSON.stringify({ error: "无法读取趋势归档", detail: error.message }), "application/json; charset=utf-8");
    }
    return;
  }

  if (url.pathname.startsWith("/media/")) {
    const mediaPath = await safeMediaPath(url.pathname);
    if (!mediaPath) {
      send(response, 400, "Invalid media path");
      return;
    }
    await serveFile(response, mediaPath);
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname.slice(1));
    } catch {
      send(response, 400, "Invalid asset path");
      return;
    }
    const assetsRoot = path.join(appRoot, "assets");
    const assetPath = path.resolve(appRoot, relativePath);
    if (!assetPath.startsWith(`${assetsRoot}${path.sep}`)) {
      send(response, 400, "Invalid asset path");
      return;
    }
    try {
      const [actualRoot, actualAsset] = await Promise.all([realpath(assetsRoot), realpath(assetPath)]);
      if (!actualAsset.startsWith(`${actualRoot}${path.sep}`)) {
        send(response, 400, "Invalid asset path");
        return;
      }
    } catch (error) {
      send(response, error.code === "ENOENT" ? 404 : 400, error.code === "ENOENT" ? "Not found" : "Invalid asset path");
      return;
    }
    await serveFile(response, assetPath);
    return;
  }

  const staticFiles = {
    "/": "brand.html",
    "/index.html": "index.html",
    "/brand.html": "brand.html",
    "/archive.json": "archive.json",
    "/archive.example.json": "archive.example.json",
    "/base.css": "base.css",
    "/home.css": "home.css",
    "/systems.css": "systems.css",
    "/collection.css": "collection.css",
    "/detail.css": "detail.css",
    "/categories.js": "categories.js",
    "/site.config.js": "site.config.js",
    "/site.config.owner.js": "site.config.owner.js",
    "/site-profile.js": "site-profile.js",
    "/site.js": "site.js",
    "/archive.js": "archive.js",
    "/swipe.js": "swipe.js",
    "/app.js": "app.js",
    "/views.js": "views.js",
    "/home.js": "home.js",
    "/elements.js": "elements.js",
    "/state.js": "state.js",
    "/media.js": "media.js",
    "/timelines.js": "timelines.js",
    "/thumbhash.js": "thumbhash.js",
    "/utils.js": "utils.js",
  };
  const staticFile = staticFiles[url.pathname];
  if (!staticFile) {
    send(response, 404, "Not found");
    return;
  }
  await serveFile(response, path.join(appRoot, staticFile));
});

server.listen(port, host, () => {
  const actualPort = server.address().port;
  console.log(`${siteConfig.site.signature} is running at http://${host}:${actualPort}`);
  console.log(`Reading images from ${archiveRoot}`);
});
