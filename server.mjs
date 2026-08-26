import http from "node:http";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categories } from "./categories.js";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const archiveRoot = path.resolve(process.env.ARCHIVE_ROOT || path.join(appRoot, "..", "trend-lab"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const titlePrefixPattern = new RegExp(`^(${Object.keys(categories).map((id) => id.split("-")[1]).join("|")})-\\d+-`);

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

async function getDay(date) {
  const items = [];

  for (const [folder, label] of Object.entries(categories)) {
    const categoryRoot = path.join(archiveRoot, folder, date);
    let files = [];
    try {
      files = await readdir(categoryRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()) {
      const details = await stat(path.join(categoryRoot, file));
      items.push({
        id: `${folder}/${file}`,
        category: folder,
        categoryLabel: label,
        file,
        title: titleFromFile(file),
        bytes: details.size,
        src: `/media/${encodeURIComponent(date)}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
      });
    }
  }

  return { date, count: items.length, items };
}

async function getArchive() {
  const dateSet = new Set();
  for (const folder of Object.keys(categories)) {
    try {
      const entries = await readdir(path.join(archiveRoot, folder), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) dateSet.add(entry.name);
      }
    } catch {
      // A missing category is equivalent to an empty category.
    }
  }
  const dates = [...dateSet].sort().reverse();

  const days = await Promise.all(dates.map(getDay));
  return { archive: "trend-lab", updatedAt: new Date().toISOString(), days };
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": contentType.startsWith("image/") ? "public, max-age=86400" : "no-cache",
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
  const resolved = path.resolve(archiveRoot, category, date, file);
  if (!resolved.startsWith(`${archiveRoot}${path.sep}`)) return null;

  const components = [
    path.join(archiveRoot, category),
    path.join(archiveRoot, category, date),
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
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method !== "GET") {
    send(response, 405, "Method not allowed");
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

  const staticFiles = {
    "/": "brand.html",
    "/index.html": "brand.html",
    "/brand.css": "brand.css",
    "/brand.js": "brand.js",
    "/categories.js": "categories.js",
    "/assets/shanzoon-glyph.svg": "assets/shanzoon-glyph.svg",
    "/assets/shanzoon-glyph-favicon.svg": "assets/shanzoon-glyph-favicon.svg",
    "/assets/project-drama-data.png": "assets/project-drama-data.png",
    "/assets/project-lingjing-ai.png": "assets/project-lingjing-ai.png",
    "/assets/project-loomicc-local-dashboard.jpg": "assets/project-loomicc-local-dashboard.jpg",
    "/assets/folder-wonder.jpg": "assets/folder-wonder.jpg",
    "/assets/folder-current.jpg": "assets/folder-current.jpg",
    "/assets/folder-underground.jpg": "assets/folder-underground.jpg",
    "/assets/folder-persona.jpg": "assets/folder-persona.jpg",
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
  console.log(`Shanzoon is running at http://${host}:${actualPort}`);
  console.log(`Reading images from ${archiveRoot}`);
});
