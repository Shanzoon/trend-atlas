import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const views = await readFile(new URL("../views.js", import.meta.url), "utf8");
// Exercise the real router, isolating its navigation and rendering boundaries.
const route = new Script(`${views.slice(views.indexOf("export function routeFromHash()")).replace(/^export /, "")}\nrouteFromHash();`);

function environment(page = "home", items = [{}]) {
  const calls = [];
  const state = { page, allItems: items };
  const renderDailyItem = () => calls.push("daily-image");
  return {
    calls, state,
    elements: { holoGallery: { hidden: false } },
    location: { hash: "#cards" },
    renderDailyItem,
    navigateHome(updateHash) {
      assert.equal(updateHash, false);
      calls.push("home");
      state.page = "home";
      renderDailyItem();
    },
    jumpToHomeScene(scene) { calls.push(scene); },
  };
}

it("initializes the home image when landing directly on the cards chapter", () => {
  const context = environment();
  route.runInNewContext(context);
  assert.deepEqual(context.calls, ["daily-image", "cards"]);
});

it("opens cards before the archive is ready and initializes the image when it arrives", () => {
  const context = environment("home", []);
  route.runInNewContext(context);
  assert.deepEqual(context.calls, ["cards"]);
  context.state.allItems = [{}];
  context.calls.length = 0;
  route.runInNewContext(context);
  assert.deepEqual(context.calls, ["daily-image", "cards"]);
});

it("restores the home image through home navigation when returning from the archive", () => {
  const context = environment("collection");
  route.runInNewContext(context);
  assert.deepEqual(context.calls, ["home", "daily-image", "cards"]);
});
