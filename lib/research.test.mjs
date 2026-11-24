import test from "node:test";
import assert from "node:assert/strict";
import { prepareResearch } from "./research.mjs";
import { csvString, OFFER_FIELDS } from "./core.mjs";
const item = {
  id: "a",
  name: "Luminária",
  room: "Sala",
  category: "Iluminação",
  qty: 1,
  unitBudget: 0,
};
const row = {
  item_id: "a",
  nome: "Luminária 220 V",
  loja: "Loja",
  preco: 100,
  frete: 0,
  link: "https://loja.example/luz",
  data_consulta: "2026-11-17",
  programa_parceiro: "Livelo",
  pontos_parceiro_taxa: 2,
  fonte_parceiro: "https://parceiro.example/regras",
  verificado_parceiro: "2026-11-17",
  validade_parceiro: "2026-11-20",
  elegibilidade_parceiro: "eligible",
};
const options = { day: "2026-11-17", observedAt: "2026-11-17T12:00:00Z" };
const run = (rows, sources) =>
  prepareResearch(
    csvString(rows, OFFER_FIELDS),
    sources.map((url) => ({ url })),
    item,
    options,
  );
test("AI research rejects product URLs not returned by web search and never fills an empty result with examples", () => {
  const unverified = run([row], []);
  assert.equal(unverified.offers.length, 0);
  assert.equal(unverified.discardedOffers, 1);
  const empty = run([], []);
  assert.equal(empty.offers.length, 0);
  assert.equal(empty.discardedOffers, 0);
  assert.equal(
    run([{ ...row, data_consulta: "2026-11-16" }], [row.link]).offers.length,
    0,
  );
});
test("unsupported loyalty rates remain pending while retrieved official evidence survives", () => {
  const pending = run([row], [row.link]).offers[0];
  assert.equal(pending.payment.partnerRate, null);
  assert.equal(pending.payment.partnerEligibility, "unknown");
  const known = run([row], [row.link, row.fonte_parceiro]).offers[0];
  assert.equal(known.payment.partnerRate, 2);
  assert.equal(known.payment.partnerSource, row.fonte_parceiro);
  assert.equal(known.observedAt, options.observedAt);
});
test("AI cannot invent the user card, membership, point valuation or stacking settings", () => {
  const result = run(
    [
      {
        ...row,
        forma_pagamento: "Cartão de crédito",
        cartao: "Inventado",
        programa_cartao: "Livelo",
        pontos_cartao_taxa: 20,
        valor_mil_cartao: 100,
        valor_mil_parceiro: 100,
        assinante_clube: "sim",
        exige_clube: "sim",
        custo_clube: 25,
        acumulo_conjunto: "yes",
      },
    ],
    [row.link, row.fonte_parceiro],
  ).offers[0];
  assert.equal(result.payment.cardRate, null);
  assert.equal(result.payment.cardName, "");
  assert.equal(result.payment.partnerValuePerThousand, null);
  assert.equal(result.payment.clubMember, false);
  assert.equal(result.payment.partnerEligibility, "unknown");
  assert.equal(result.payment.stacking, "unknown");
});
test("invalid rows are discarded individually, and tracked versions of retrieved links match", () => {
  const result = run(
    [{ ...row, preco: -1 }, row],
    [row.link + "?utm_source=search", row.fonte_parceiro],
  );
  assert.equal(result.offers.length, 1);
  assert.equal(result.discardedOffers, 1);
  assert.ok(result.warnings.length);
});
