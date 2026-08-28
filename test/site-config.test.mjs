import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteConfig as templateConfig } from "../site.config.js";
import { siteConfig as ownerConfig } from "../site.config.owner.js";
import { siteConfig as activeConfig, siteProfile } from "../site-profile.js";
import { validateSiteConfig } from "../site.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("site configuration", () => {
  it("keeps the current site and the fork starter config valid", () => {
    assert.equal(validateSiteConfig(activeConfig), activeConfig);
    assert.equal(validateSiteConfig(templateConfig), templateConfig);
    assert.equal(validateSiteConfig(ownerConfig), ownerConfig);
    assert.equal(siteProfile, process.env.SITE_PROFILE === "owner" ? "owner" : "template");
  });

  it("keeps every starter image and manifest inside the repository", async () => {
    assert.equal(JSON.stringify(templateConfig).includes("shanzoon"), false);
    assert.ok(templateConfig.archive.manifestPath.startsWith("/"));
    for (const category of templateConfig.archive.categories) {
      assert.ok(category.cover.startsWith("/assets/example-"));
      assert.ok(category.preview.startsWith("/assets/example-"));
    }
    for (const project of templateConfig.projects) assert.ok(project.image.src.startsWith("/assets/example-"));

    const archive = JSON.parse(await readFile(path.join(appRoot, templateConfig.archive.manifestPath), "utf8"));
    const items = archive.days.flatMap((day) => day.items);
    assert.equal(items.length, 4);
    assert.ok(items.every((item) => item.src.startsWith("/assets/example-")));
  });

  it("reports structural mistakes with the field that needs attention", () => {
    const invalid = structuredClone(templateConfig);
    invalid.projects = invalid.projects.slice(0, 2);
    assert.throws(() => validateSiteConfig(invalid), /projects 必须保留 3 个项目/);
  });

  it("rejects category ids that can escape an image root", () => {
    for (const id of ["../outside", "nested/folder", "nested\\folder", ".", ".."]) {
      const invalid = structuredClone(templateConfig);
      invalid.archive.categories[0].id = id;
      assert.throws(() => validateSiteConfig(invalid), /id 必须是单一路径段/);
    }
  });

  it("recognizes the production and branch-preview owner hosts", async () => {
    const source = await readFile(path.join(appRoot, "site-profile.js"), "utf8");
    assert.match(source, /hostname === "me\.shanzoon\.art"/);
    assert.match(source, /hostname\.endsWith\("\.trend-atlas\.pages\.dev"\)/);
  });
});
