import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { siteConfig as owner } from "../site.config.owner.js";
import { siteConfig as starter } from "../site.config.js";
import { renderSiteHtml } from "../scripts/render-site.mjs";
import { buildSite } from "../scripts/build-site.mjs";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const template = await readFile(path.join(appRoot, "brand.html"), "utf8");
const fork = structuredClone(starter);
fork.site.title = "Alex — Portfolio";
fork.site.signature = "Alex";
fork.hero.name = "Alex Chen";
fork.hero.kicker = "Alex's work";
fork.hero.role = "Designer · Developer";

describe("initial HTML identity", () => {
  for (const [profile, config] of [["owner", owner], ["custom fork", fork]]) {
    it(`renders ${profile} content before any JavaScript runs`, () => {
      const html = renderSiteHtml(template, config);
      const { document } = parseHTML(html);
      assert.equal(document.title, config.site.title);
      assert.equal(document.querySelector("#brandName").textContent, config.hero.name);
      assert.equal(document.querySelector("#siteSignature").textContent, config.site.signature);
      assert.equal(document.querySelector("#siteLogo").getAttribute("src"), config.site.logo);
      assert.equal(document.querySelector("#identityKicker").textContent, config.hero.kicker);
      assert.equal(document.querySelector("#identityRole").textContent, config.hero.role);
      assert.equal(document.querySelector("#identityIntroduction").textContent, config.hero.introduction.join(""));
      assert.equal(document.querySelector('meta[name="description"]').content, config.site.description);
      assert.equal(document.querySelector("#homeLink").getAttribute("aria-label"), config.site.homeLabel);
      assert.deepEqual(JSON.parse(document.querySelector("#siteConfig").textContent), config);
      assert.doesNotMatch(document.querySelector("#stageIdentity").textContent, /Your Name|YOUR ROLE/);
      document.querySelectorAll("[data-project-sheet]").forEach((sheet, index) => {
        const project = config.projects[index];
        const image = sheet.querySelector("img");
        assert.equal(sheet.querySelector(".project-title").textContent, project.title);
        assert.equal(image.getAttribute("src"), project.image.src);
        assert.equal(Number(image.getAttribute("width")), project.image.width);
        assert.equal(Number(image.getAttribute("height")), project.image.height);
        assert.equal(sheet.querySelector(".project-visit").hasAttribute("hidden"), !project.link);
      });
      if (profile === "custom fork") assert.doesNotMatch(html, /shanzoon/i);
    });
  }

  it("keeps configured text and the embedded JSON safe at HTML boundaries", () => {
    const config = structuredClone(fork);
    config.hero.name = 'A & B </script><script id="injected">alert(1)</script>';
    config.site.description = 'Quotes " & < >';
    const { document } = parseHTML(renderSiteHtml(template, config));
    assert.equal(document.querySelector("#brandName").textContent, config.hero.name);
    assert.equal(document.querySelector('meta[name="description"]').content, config.site.description);
    assert.equal(document.querySelector("#injected"), null);
    assert.deepEqual(JSON.parse(document.querySelector("#siteConfig").textContent), config);
    assert.equal(document.querySelectorAll("script").length, 2);
  });

  it("keeps browser configuration identical to the HTML even on an owner hostname or conflicting query", () => {
    const html = renderSiteHtml(template, fork);
    const code = `
      import { readFileSync } from 'node:fs';
      import { parseHTML } from 'linkedom';
      globalThis.document = parseHTML(readFileSync(0, 'utf8')).document;
      globalThis.location = new URL('https://me.shanzoon.art/?profile=owner');
      const { siteConfig } = await import('./site-profile.js');
      process.stdout.write(JSON.stringify(siteConfig));
    `;
    const config = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: appRoot, input: html, encoding: "utf8" }));
    assert.deepEqual(config, fork);
  });
});

describe("static production build", () => {
  it("builds complete, identical entries and ships only public runtime resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trend-atlas-build-"));
    try {
      for (const config of [owner, fork]) {
        const output = await buildSite(config, path.join(root, "dist"));
        const html = await readFile(path.join(output, "index.html"), "utf8");
        assert.equal(html, await readFile(path.join(output, "brand.html"), "utf8"));
        const { document } = parseHTML(html);
        assert.equal(document.querySelector("#brandName").textContent, config.hero.name);
        assert.doesNotMatch(html, /http-equiv="refresh"|location\.replace/);
        for (const element of document.querySelectorAll("[src], link[href]")) {
          const reference = element.getAttribute("src") || element.getAttribute("href");
          if (reference?.startsWith("/")) await readFile(path.join(output, reference.split("?")[0]));
        }
        await readFile(path.join(output, config.archive.manifestPath));
        const names = await readdir(output);
        for (const privateFile of ["server.mjs", "node_modules", "scripts", ".env", ".wrangler", "package.json"]) assert.ok(!names.includes(privateFile));
        const assets = await readdir(path.join(output, "assets"));
        assert.ok(assets.every((file) => file.endsWith(".svg")), "unreferenced local source PNGs must not be published");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an invalid config before replacing an existing build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trend-atlas-build-"));
    try {
      const output = await buildSite(owner, path.join(root, "dist"));
      const before = await readFile(path.join(output, "index.html"), "utf8");
      const invalid = structuredClone(owner);
      invalid.hero.name = "";
      await assert.rejects(buildSite(invalid, output), /hero.name/);
      assert.equal(await readFile(path.join(output, "index.html"), "utf8"), before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
