import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquirePublishLock,
  assertR2ObjectAbsent,
  buildArchive,
  confirmMissingObjects,
  parseSourceFile,
  publicUrlFor,
} from "../scripts/publish-images.mjs";

describe("incremental image publisher", () => {
  it("accepts dated PNG sources and maps them to stable WebP keys", () => {
    assert.deepEqual(parseSourceFile("2026-08-28__interesting-01-new-work.png"), {
      date: "2026-08-28",
      sourceFile: "2026-08-28__interesting-01-new-work.png",
      webpFile: "interesting-01-new-work.webp",
    });
    assert.equal(parseSourceFile("notes.txt"), null);
    assert.equal(
      publicUrlFor("01-Dreamscape", "2026-08-28__interesting-01-new-work.png"),
      "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp",
    );
  });

  it("builds the existing archive shape in reverse date order", () => {
    const archive = buildArchive([
      {
        category: "02-Lens",
        categoryLabel: "Lens",
        date: "2026-08-27",
        webpFile: "hottest-01-street.webp",
        bytes: 20,
        width: 1600,
        height: 900,
        url: "https://media.shanzoon.art/02-Lens/2026-08-27__hottest-01-street.webp",
      },
      {
        category: "01-Dreamscape",
        categoryLabel: "Dreamscape",
        date: "2026-08-28",
        webpFile: "interesting-01-new-work.webp",
        bytes: 10,
        width: 1024,
        height: 1536,
        url: "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp",
      },
    ], "2026-08-28T00:00:00.000Z");

    assert.deepEqual(archive.days.map((day) => day.date), ["2026-08-28", "2026-08-27"]);
    assert.equal(archive.days[0].items[0].title, "New Work");
    assert.equal(archive.days[0].items[0].width, 1024);
    assert.equal(archive.days[0].items[0].height, 1536);
    assert.equal(archive.days[0].items[0].src, "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp");
  });

  it("keeps historical objects when the public probe returns a false 404", async () => {
    const historicalUrl = "https://media.shanzoon.art/01-Dreamscape/existing.webp";
    const items = [{ key: "01-Dreamscape/existing.webp", url: historicalUrl }];
    const previous = { days: [{ items: [{ src: historicalUrl }] }] };
    const statuses = await confirmMissingObjects(
      items,
      [{ exists: false }],
      previous,
      async () => ({ exists: true, bytes: 42 }),
    );

    assert.deepEqual(statuses, [{ exists: true, bytes: 42 }]);
  });

  it("directly checks every candidate and uploads only confirmed absences", async () => {
    const items = [
      { key: "01-Dreamscape/old.webp", url: "https://media.shanzoon.art/01-Dreamscape/old.webp" },
      { key: "01-Dreamscape/new.webp", url: "https://media.shanzoon.art/01-Dreamscape/new.webp" },
    ];
    const previous = { days: [{ items: [{ src: items[0].url }] }] };
    const inspected = [];

    assert.deepEqual(
      await confirmMissingObjects(items, [{ exists: false }, { exists: false }], previous, async (item) => {
        inspected.push(item.key);
        return { exists: false };
      }),
      [{ exists: false }, { exists: false }],
    );
    assert.deepEqual(inspected, items.map((item) => item.key));
  });

  it("refuses to overwrite an unmanifested object or continue after an uncertain check", async () => {
    const item = { key: "01-Dreamscape/new.webp", url: "https://media.shanzoon.art/01-Dreamscape/new.webp" };
    await assert.rejects(
      confirmMissingObjects([item], [{ exists: false }], undefined, async () => ({ exists: true, bytes: 42 })),
      /exists outside archive\.json; refusing to overwrite/,
    );
    await assert.rejects(
      confirmMissingObjects([item], [{ exists: false }], undefined, async () => { throw new Error("auth unavailable"); }),
      /refusing to publish: auth unavailable/,
    );
  });

  it("rechecks immediately before upload and serializes formal publishers", async () => {
    const item = { key: "01-Dreamscape/new.webp" };
    await assertR2ObjectAbsent(item, async () => ({ exists: false }));
    await assert.rejects(
      assertR2ObjectAbsent(item, async () => ({ exists: true })),
      /appeared before upload; refusing to overwrite/,
    );

    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "trend-atlas-lock-test-"));
    const lockPath = path.join(temporaryRoot, "publish.lock");
    try {
      const release = await acquirePublishLock(lockPath);
      await assert.rejects(acquirePublishLock(lockPath), /Another image publish is already running/);
      await release();
      const releaseAgain = await acquirePublishLock(lockPath);
      await releaseAgain();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
