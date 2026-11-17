import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePayment,
  normalizePayment,
  paymentErrors,
} from "./payments.mjs";
import {
  OFFER_FIELDS,
  parseCSV,
  csvString,
  prepareOffers,
  offersToRows,
  prepareImport,
} from "./core.mjs";
import { partitionOffers, filterOffers } from "./offers.mjs";
import { validateWorkspace } from "./workspace.mjs";

const day = "2026-11-17";
const item = {
  id: "light",
  name: "Luminária",
  room: "Sala",
  category: "Iluminação",
  qty: 2,
  unitBudget: 0,
  status: "Planejado",
  priority: "Média",
};
const offer = {
  id: "a",
  itemId: item.id,
  model: "Luminária 220 V",
  store: "Loja",
  price: 1000,
  shipping: 50,
  url: "https://loja.example/produto",
  date: day,
  source: "imported",
};
const card = {
  method: "Cartão de crédito",
  installments: 10,
  cardName: "Cartão informado pelo usuário",
  cardProgram: "Programa A",
  cardRate: 2,
  cardUnit: "USD",
  exchangeRate: 5,
  cardSource: "https://emissor.example/regras",
  cardVerifiedAt: day,
  cardValuePerThousand: 20,
};
const partner = {
  partnerProgram: "Programa B",
  partnerRate: 5,
  partnerSource: "https://parceiro.example/regulamento",
  partnerVerifiedAt: day,
  partnerExpiresAt: "2026-11-20",
  partnerEligibility: "eligible",
  partnerValuePerThousand: 20,
};
const calc = (payment, extra = {}) =>
  evaluatePayment({ ...offer, payment, ...extra }, { asOf: day });

test("cash outlay stays separate from the estimated value of card points and total installments", () => {
  const r = calc(card);
  assert.equal(r.checkout, 1050);
  assert.equal(r.outlay, 1050);
  assert.equal(r.rewards[0].points, 400);
  assert.equal(r.benefit, 8);
  assert.equal(r.effective, 1042);
  assert.equal(calc({ ...card, fees: 10, clubCost: 30 }).outlay, 1090);
  assert.equal(calc({ ...card, fees: 10, clubCost: 30 }).checkout, 1060);
});
test("card defaults to product-only eligible spend and USD points require an explicit conversion", () => {
  assert.equal(
    calc({ ...card, cardEligibleAmount: 1050 }).rewards[0].points,
    420,
  );
  assert.equal(calc({ ...card, exchangeRate: null }).effective, null);
  assert.equal(calc({ ...card, cardUnit: "" }).effective, null);
  assert.equal(calc({ ...card, method: "" }).effective, null);
  assert.equal(
    calc({ ...card, cardUnit: "BRL", exchangeRate: null }).rewards[0].points,
    2000,
  );
  assert.equal(calc({ ...card, method: "Pix" }).benefit, 0);
});
test("missing valuation, source, future verification or unconfirmed eligibility cannot drive effective ranking", () => {
  for (const patch of [
    { cardValuePerThousand: null },
    { cardSource: "" },
    { cardVerifiedAt: "2026-11-18" },
  ])
    assert.equal(calc({ ...card, ...patch }).effective, null);
  assert.equal(
    calc({ ...partner, partnerEligibility: "unknown" }).effective,
    null,
  );
  assert.equal(calc({ ...partner, partnerSource: "" }).effective, null);
  assert.equal(
    calc({ ...partner, partnerExpiresAt: "", partnerVerifiedAt: "2026-11-16" })
      .effective,
    null,
  );
});
test("expired, ineligible and member-only campaigns do not generate benefits for a nonmember", () => {
  for (const patch of [
    { partnerExpiresAt: "2026-11-16", partnerVerifiedAt: "2026-11-15" },
    { partnerEligibility: "ineligible" },
    { requiresClub: true, clubMember: false },
  ]) {
    const r = calc({ ...partner, ...patch });
    assert.equal(r.benefit, 0);
    assert.equal(r.rewards[1].status, "ineligible");
  }
  assert.equal(
    calc({ ...partner, requiresClub: true, clubMember: true, clubCost: 30 })
      .effective,
    980,
  );
});
test("card and store rewards are added only when stacking is confirmed; exclusive rewards use one alternative", () => {
  assert.equal(calc({ ...card, ...partner }).effective, null);
  assert.equal(calc({ ...card, ...partner, stacking: "yes" }).benefit, 108);
  assert.equal(calc({ ...card, ...partner, stacking: "no" }).benefit, 100);
  assert.deepEqual(calc({ ...card, ...partner, stacking: "no" }).applied, [
    "partner",
  ]);
});
test("unknown freight prevents a total, and quantity is applied before rounding points", () => {
  assert.equal(calc(card, { shipping: null }).effective, null);
  assert.equal(calc(card, { shipping: null }).outlay, null);
  const r = evaluatePayment(
    {
      ...offer,
      price: 1,
      shipping: 0,
      payment: { ...partner, partnerRate: 0.5 },
    },
    { asOf: day, quantity: 2 },
  );
  assert.equal(r.rewards[1].points, 1);
});
test("invalid financial fields, dates, enum choices, bases and unsafe sources are rejected", () => {
  for (const patch of [
    { cardRate: -1 },
    { installments: 121 },
    { partnerVerifiedAt: "2026-02-30" },
    { stacking: "maybe" },
    { cardSource: "javascript:alert(1)" },
    { cardSource: "https://user:pass@host.example/" },
    { exchangeRate: 0 },
    { partnerEligibleAmount: 1100 },
    { cardEligibleAmount: 1200 },
    { partnerVerifiedAt: "2026-11-20", partnerExpiresAt: day },
  ])
    assert.ok(paymentErrors(patch, offer).length, JSON.stringify(patch));
});
test("Pix, card, different installment plans and member rates coexist while rate updates retain history", () => {
  const rows = [
    { ...offer, id: "pix", payment: { method: "Pix" } },
    { ...offer, id: "credit", payment: card },
    { ...offer, id: "1x", payment: { ...card, installments: 1 } },
    {
      ...offer,
      id: "club",
      payment: { ...card, ...partner, requiresClub: true },
    },
    {
      ...offer,
      id: "new",
      date: "2026-11-18",
      payment: { ...card, cardRate: 3 },
    },
  ];
  const r = partitionOffers(rows);
  assert.equal(r.current.length, 4);
  assert.deepEqual(
    r.archived.map((o) => o.id),
    ["credit"],
  );
});
test("financial CSV round-trip preserves evidence, unknown valuations, booleans and payment alternatives", () => {
  const input = [
    {
      ...offer,
      payment: {
        ...card,
        ...partner,
        requiresClub: true,
        clubMember: false,
        conditions: "Usar portal; conferir vendedor",
        stacking: "yes",
      },
    },
  ];
  const csv = csvString(offersToRows(input, [item]), OFFER_FIELDS),
    parsed = prepareOffers(parseCSV(csv), [item]);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.offers[0].payment,
    normalizePayment(input[0].payment),
  );
  const again = prepareOffers(parseCSV(csv), [item], {
    existing: parsed.offers,
  });
  assert.equal(again.duplicates, 1);
  const legacy = prepareOffers(
    [
      {
        item_id: item.id,
        nome: offer.model,
        preco: 1000,
        link: offer.url,
        data_consulta: day,
      },
    ],
    [item],
  );
  assert.deepEqual(legacy.errors, []);
  assert.equal(legacy.offers[0].shipping, null);
  assert.equal(legacy.offers[0].payment.cardRate, null);
});
test("effective sorting includes only complete estimates before pending alternatives", () => {
  const pending = {
    ...offer,
    id: "pending",
    price: 10,
    payment: { ...card, cardValuePerThousand: null },
  };
  const known = { ...offer, id: "known", payment: card };
  assert.equal(
    filterOffers([pending, known], { sort: "effective" })[0].id,
    "known",
  );
});
test("simple checklists can complete without a purchase; old shopping projects retain financial validation", () => {
  const data = {
    version: 1,
    projects: [{ id: "home", name: "Tarefas", mode: "checklist" }],
    items: { home: [{ ...item, status: "Concluído" }] },
    offers: [],
  };
  assert.equal(validateWorkspace(data).items.home[0].paidTotal, 0);
  data.items.home[0].status = "Comprado";
  assert.doesNotThrow(() => validateWorkspace(data));
  delete data.projects[0].mode;
  assert.throws(() => validateWorkspace(data), /Compra sem data/);
  const imported = prepareImport(
    [
      {
        ambiente: "Sala",
        categoria: "Tarefas",
        item: "Medir janela",
        status: "Concluído",
      },
    ],
    {
      ambiente: "ambiente",
      categoria: "categoria",
      item: "item",
      status: "status",
    },
  );
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.items[0].unitBudget, 0);
});
test("workspace and backups preserve financial metadata and reject invalid payment data", () => {
  const data = {
    version: 1,
    projects: [{ id: "home", name: "Apartamento", budget: 0 }],
    items: { home: [item] },
    offers: [{ ...offer, payment: { ...card, ...partner, stacking: "yes" } }],
  };
  assert.deepEqual(
    validateWorkspace(data).offers[0].payment,
    normalizePayment(data.offers[0].payment),
  );
  data.offers[0].payment.partnerSource = "http://insecure.example";
  assert.throws(() => validateWorkspace(data), /HTTPS/);
});
