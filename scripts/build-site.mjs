import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteConfig } from "../site-profile.js";
import { renderSiteHtml } from "./render-site.mjs";

const appRoot = fileURLToPath(new URL("../", import.meta.url));

// Only configured public resources go into the deployment, never local source
// images, credentials, node_modules, or the development server.
function localResource(reference) {
  const base = "https://portfolio.invalid";
  const url = new URL(reference, base);
  if (url.origin !== base) return null;
  const file = decodeURIComponent(url.pathname).slice(1);
  if (!file || path.isAbsolute(file) || file.includes("\\") || file.split("/").includes("..")) {
    throw new Error(`Invalid public resource path: ${reference}`);
  }
  return file;
}

export async function buildSite(config = siteConfig, outputDir = path.join(appRoot, "dist")) {
  outputDir = path.resolve(outputDir);
  if (outputDir !== path.join(appRoot, "dist") && (
    outputDir === path.resolve(appRoot)
    || outputDir.startsWith(appRoot)
    || appRoot.startsWith(`${outputDir}${path.sep}`)
  )) throw new Error("Build output must not overwrite source files");
  const html = renderSiteHtml(await readFile(path.join(appRoot, "brand.html"), "utf8"), config);
  const files = new Set((await readdir(appRoot)).filter((file) => /\.(js|css)$/.test(file)));
  files.add("_headers");

  const references = [config.site.logo, config.site.favicon];
  for (const category of config.archive.categories) references.push(category.cover, category.preview);
  for (const project of config.projects) references.push(project.image.src);
  const manifestPath = localResource(config.archive.manifestPath);
  if (manifestPath) {
    files.add(manifestPath);
    const manifest = JSON.parse(await readFile(path.join(appRoot, manifestPath), "utf8"));
    for (const day of manifest.days) {
      for (const item of day.items) references.push(item.src);
    }
  }
  for (const reference of references) {
    const file = localResource(reference);
    if (file) files.add(file);
  }

  const actualRoot = await realpath(appRoot);
  for (const file of files) {
    if (!(await realpath(path.join(appRoot, file))).startsWith(`${actualRoot}${path.sep}`)) {
      throw new Error(`Public resource escapes the repository: ${file}`);
    }
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  for (const file of files) {
    const destination = path.join(outputDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(appRoot, file), destination);
  }
  await writeFile(path.join(outputDir, "index.html"), html);
  await writeFile(path.join(outputDir, "brand.html"), html);
  return outputDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built ${siteConfig.hero.name}: ${await buildSite()}`);
}
