import test from "node:test";
import assert from "node:assert/strict";
import { DEMO } from "./demo.mjs";
import {
  validateWorkspace,
  emptyWorkspace,
  mergeLocalWorkspace,
  manageStructure,
  addLiveOffers,
} from "./workspace.mjs";
test("existing V1 data and an empty account validate without fabricated defaults", () => {
  assert.equal(validateWorkspace(DEMO).projects.length, 2);
  assert.deepEqual(validateWorkspace(emptyWorkspace()), emptyWorkspace());
});
test("migration preserves all projects, item relationships and is idempotent", () => {
  const source = validateWorkspace(DEMO),
    first = mergeLocalWorkspace(emptyWorkspace(), source, "testmigration");
  assert.equal(first.projects.length, 2);
  const parent = first.items[first.projects[0].id].find(
    (i) => i.name === "Marcenaria planejada",
  );
  assert.ok(
    first.items[first.projects[0].id].some((i) => i.parentId === parent.id),
  );
  assert.deepEqual(mergeLocalWorkspace(first, source, "testmigration"), first);
});
test("server validation rejects foreign item references and cyclic hierarchies", () => {
  const data = structuredClone(DEMO);
  data.items.apartment[0].parentId = data.items.apartment[0].id;
  assert.throws(() => validateWorkspace(data));
  const other = structuredClone(DEMO);
  other.items.foreign = [];
  assert.throws(() => validateWorkspace(other));
});
test("renaming and removing categories update descendants and related offers", () => {
  const source = validateWorkspace(DEMO),
    renamed = manageStructure(source, "apartment", {
      kind: "category",
      oldName: "Instalação e marcenaria",
      name: "Marcenaria",
      remove: false,
    });
  assert.equal(
    renamed.items.apartment.filter((i) => i.category === "Marcenaria").length,
    source.items.apartment.filter(
      (i) => i.category === "Instalação e marcenaria",
    ).length,
  );
  const removed = manageStructure(renamed, "apartment", {
    kind: "category",
    oldName: "Marcenaria",
    remove: true,
  });
  assert.ok(!removed.items.apartment.some((i) => i.category === "Marcenaria"));
  assert.equal(source.projects.length, 2);
});
test("live results retain durable IDs and repeated results are not duplicated", () => {
  const source = validateWorkspace(DEMO),
    offer = {
      id: "query-1",
      itemId: source.items.apartment[0].id,
      model: "Real result",
      store: "Store",
      price: 100,
      date: "2026-10-26",
      url: "https://example.com/p",
      source: "live",
    };
  const next = addLiveOffers(source, [offer]);
  assert.equal(next.offers[0].id, "query-1");
  assert.equal(addLiveOffers(next, [offer]).offers.length, 1);
});
