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
test("backup import preserves projects whose 100-character IDs differ only at the end", async () => {
  const a = "p".repeat(99) + "a",
    b = "p".repeat(99) + "b";
  const source = {
    ...emptyWorkspace(),
    projects: [
      { id: a, name: "Casa A", budget: 100 },
      { id: b, name: "Casa B", budget: 200 },
    ],
    items: { [a]: [], [b]: [] },
  };
  const result = await mergeLocalWorkspace(
    emptyWorkspace(),
    source,
    "backup123456",
  );
  assert.equal(
    result.projects.length,
    2,
    "A valid backup must not silently drop the second project",
  );
  assert.equal(new Set(result.projects.map((p) => p.id)).size, 2);
  assert.ok(result.projects.every((p) => p.id.length <= 100));
  assert.deepEqual(
    await mergeLocalWorkspace(result, source, "backup123456"),
    result,
  );
});
test("backup import preserves long item and offer IDs and their parent relationships", async () => {
  const a = "i".repeat(99) + "a",
    b = "i".repeat(99) + "b";
  const item = {
    name: "Item",
    room: "Cozinha",
    category: "Móveis",
    qty: 1,
    unitBudget: 100,
    status: "Planejado",
    priority: "Média",
  };
  const source = {
    ...emptyWorkspace(),
    projects: [{ id: "home", name: "Casa", budget: 500 }],
    items: {
      home: [
        { ...item, id: a },
        { ...item, id: b, parentId: a },
      ],
    },
    offers: ["a", "b"].map((end) => ({
      id: "o".repeat(99) + end,
      itemId: b,
      model: "Modelo",
      store: "Loja",
      price: 100,
      date: "2026-11-02",
      url: "https://example.com/p",
      source: "imported",
    })),
  };
  const result = await mergeLocalWorkspace(
    emptyWorkspace(),
    source,
    "backup123456",
  );
  const items = Object.values(result.items).flat();
  assert.equal(items.length, 2);
  assert.equal(items[1].parentId, items[0].id);
  assert.ok(result.offers.every((o) => o.itemId === items[1].id));
  assert.equal(new Set(result.offers.map((o) => o.id)).size, 2);
  assert.deepEqual(
    await mergeLocalWorkspace(result, source, "backup123456"),
    result,
  );
});
test("existing V1 data and an empty account validate without fabricated defaults", () => {
  assert.equal(validateWorkspace(DEMO).projects.length, 2);
  assert.deepEqual(validateWorkspace(emptyWorkspace()), emptyWorkspace());
});
test("migration preserves all projects, item relationships and is idempotent", async () => {
  const source = validateWorkspace(DEMO),
    first = await mergeLocalWorkspace(
      emptyWorkspace(),
      source,
      "testmigration",
    );
  assert.equal(first.projects.length, 2);
  const parent = first.items[first.projects[0].id].find(
    (i) => i.name === "Marcenaria planejada",
  );
  assert.ok(
    first.items[first.projects[0].id].some((i) => i.parentId === parent.id),
  );
  assert.deepEqual(
    await mergeLocalWorkspace(first, source, "testmigration"),
    first,
  );
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
