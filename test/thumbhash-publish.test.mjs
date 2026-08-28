import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { thumbHashToRGBA } from "thumbhash";
import { buildArchive, createThumbHash, isThumbHashString, prepareThumbHashes } from "../scripts/publish-images.mjs";

describe("published ThumbHash metadata", () => {
  it("encodes a source image as a decodable standard Base64 string", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-thumbhash-test-"));
    const sourcePath = path.join(temporaryRoot, "source.png");
    try {
      await sharp({
        create: {
          width: 160,
          height: 90,
          channels: 3,
          background: { r: 32, g: 96, b: 160 },
        },
      }).png().toFile(sourcePath);

      const thumbhash = await createThumbHash(sourcePath);
      assert.match(thumbhash, /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/);
      const decoded = thumbHashToRGBA(Buffer.from(thumbhash, "base64"));
      assert.ok(decoded.w > decoded.h);
      assert.equal(decoded.rgba.length, decoded.w * decoded.h * 4);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("includes ThumbHash when available and omits it for legacy fallback items", () => {
    const baseItem = {
      category: "01-Dreamscape",
      categoryLabel: "Dreamscape",
      date: "2026-08-28",
      webpFile: "interesting-01-new-work.webp",
      bytes: 10,
      width: 1024,
      height: 1536,
      url: "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp",
    };
    const withHash = buildArchive([{ ...baseItem, thumbhash: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A" }]);
    const withoutHash = buildArchive([baseItem]);

    assert.equal(withHash.days[0].items[0].thumbhash, "3OcRJYB4d3h/iIeHeEh3eIhw+j3A");
    assert.equal(Object.hasOwn(withoutHash.days[0].items[0], "thumbhash"), false);
  });

  it("preserves existing hashes and generates only missing metadata", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-thumbhash-preserve-test-"));
    const sourcePath = path.join(temporaryRoot, "new-source.png");
    const preserved = "3OcRJYB4d3h/iIeHeEh3eIhw+j3A";
    const existingUrl = "https://media.shanzoon.art/01-Dreamscape/existing.webp";
    try {
      await sharp({
        create: {
          width: 40,
          height: 60,
          channels: 3,
          background: { r: 180, g: 90, b: 30 },
        },
      }).png().toFile(sourcePath);
      const items = [
        { key: "existing", url: existingUrl, sourcePath: path.join(temporaryRoot, "does-not-exist.png") },
        { key: "new", url: "https://media.shanzoon.art/01-Dreamscape/new.webp", sourcePath },
        { key: "invalid", url: "https://media.shanzoon.art/01-Dreamscape/invalid.webp", sourcePath },
      ];
      const previous = { days: [{ items: [
        { src: existingUrl, thumbhash: preserved },
        { src: items[2].url, thumbhash: "not-base64" },
      ] }] };

      const result = await prepareThumbHashes(items, previous);
      assert.deepEqual(result, { generated: 2, preserved: 1 });
      assert.equal(items[0].thumbhash, preserved);
      assert.equal(isThumbHashString(items[1].thumbhash), true);
      assert.equal(isThumbHashString(items[2].thumbhash), true);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
