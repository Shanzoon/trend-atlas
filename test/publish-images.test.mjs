import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildArchive, parseSourceFile, publicUrlFor } from "../scripts/publish-images.mjs";

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
        url: "https://media.shanzoon.art/02-Lens/2026-08-27__hottest-01-street.webp",
      },
      {
        category: "01-Dreamscape",
        categoryLabel: "Dreamscape",
        date: "2026-08-28",
        webpFile: "interesting-01-new-work.webp",
        bytes: 10,
        url: "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp",
      },
    ], "2026-08-28T00:00:00.000Z");

    assert.deepEqual(archive.days.map((day) => day.date), ["2026-08-28", "2026-08-27"]);
    assert.equal(archive.days[0].items[0].title, "New Work");
    assert.equal(archive.days[0].items[0].src, "https://media.shanzoon.art/01-Dreamscape/2026-08-28__interesting-01-new-work.webp");
  });
});
