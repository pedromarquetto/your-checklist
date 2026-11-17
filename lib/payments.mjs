// Monetary values and eligible bases are per unit; rates and valuations are
// user-supplied. No bank, loyalty campaign or point valuation is assumed.
export const PAYMENT_FIELDS = [
  [
    "method",
    "Forma de pagamento",
    "enum",
    "forma_pagamento",
    ["", "Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Dinheiro"],
  ],
  ["installments", "Número de parcelas", "integer", "parcelas"],
  ["fees", "Taxas adicionais (R$ por unidade)", "amount", "taxas"],
  ["cardName", "Nome do cartão", "text", "cartao"],
  ["cardProgram", "Programa do cartão", "text", "programa_cartao"],
  [
    "cardRate",
    "Pontos do cartão por real ou dólar",
    "number",
    "pontos_cartao_taxa",
  ],
  [
    "cardUnit",
    "Unidade da taxa do cartão",
    "enum",
    "pontos_cartao_unidade",
    ["", "BRL", "USD"],
  ],
  [
    "exchangeRate",
    "Cotação do dólar usada pelo cartão (R$)",
    "number",
    "cotacao_dolar",
  ],
  [
    "cardEligibleAmount",
    "Base pontuável do cartão (R$ por unidade)",
    "number",
    "base_cartao",
  ],
  [
    "cardValuePerThousand",
    "Sua estimativa em R$ por 1.000 pontos do cartão",
    "number",
    "valor_mil_cartao",
  ],
  ["cardSource", "Link das regras do cartão", "url", "fonte_cartao"],
  [
    "cardVerifiedAt",
    "Data da verificação do cartão",
    "date",
    "verificado_cartao",
  ],
  ["cardExpiresAt", "Validade das regras do cartão", "date", "validade_cartao"],
  ["partnerProgram", "Programa parceiro da loja", "text", "programa_parceiro"],
  [
    "partnerRate",
    "Pontos do parceiro por R$ 1",
    "number",
    "pontos_parceiro_taxa",
  ],
  [
    "partnerEligibleAmount",
    "Base pontuável do parceiro (R$ por unidade)",
    "number",
    "base_parceiro",
  ],
  [
    "partnerValuePerThousand",
    "Sua estimativa em R$ por 1.000 pontos do parceiro",
    "number",
    "valor_mil_parceiro",
  ],
  [
    "partnerSource",
    "Link oficial da campanha / regulamento",
    "url",
    "fonte_parceiro",
  ],
  [
    "partnerVerifiedAt",
    "Data da verificação da parceria",
    "date",
    "verificado_parceiro",
  ],
  ["partnerExpiresAt", "Último dia da campanha", "date", "validade_parceiro"],
  [
    "partnerEligibility",
    "Elegibilidade na campanha",
    "enum",
    "elegibilidade_parceiro",
    ["unknown", "eligible", "ineligible"],
  ],
  ["requiresClub", "Esta taxa exige clube", "boolean", "exige_clube"],
  ["clubMember", "Tenho o clube exigido", "boolean", "assinante_clube"],
  [
    "clubCost",
    "Custo extra do clube alocado por unidade (R$)",
    "amount",
    "custo_clube",
  ],
  [
    "stacking",
    "Acúmulo conjunto de cartão e parceiro",
    "enum",
    "acumulo_conjunto",
    ["unknown", "yes", "no"],
  ],
  [
    "conditions",
    "Regras: canal, vendedor, cupom, exclusões e crédito dos pontos",
    "longtext",
    "condicoes_pontos",
  ],
];
export function normalizePayment(input = {}) {
  return Object.fromEntries(
    PAYMENT_FIELDS.map(([key, , type, , options]) => [
      key,
      input[key] ??
        (type === "number"
          ? null
          : type === "amount"
            ? 0
            : type === "integer"
              ? 1
              : type === "boolean"
                ? false
                : type === "enum"
                  ? options[0]
                  : ""),
    ]),
  );
}
export function validDay(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
const validSource = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function paymentErrors(input = {}, offer = null) {
  const p = normalizePayment(input),
    errors = [];
  for (const [key, label, type, , options] of PAYMENT_FIELDS) {
    const v = p[key];
    if (
      ["number", "amount", "integer"].includes(type) &&
      v !== null &&
      (!Number.isFinite(v) ||
        v < 0 ||
        v > 1e10 ||
        (type === "integer" && (!Number.isInteger(v) || v < 1 || v > 120)))
    )
      errors.push(`${label}: número inválido.`);
    if (type === "enum" && !options.includes(v))
      errors.push(`${label}: opção inválida.`);
    if (type === "boolean" && typeof v !== "boolean")
      errors.push(`${label}: use sim ou nao.`);
    if (
      ["text", "longtext", "url", "date"].includes(type) &&
      (typeof v !== "string" ||
        v.length >
          (type === "longtext"
            ? 3000
            : type === "url"
              ? 3000
              : type === "date"
                ? 10
                : 300))
    )
      errors.push(`${label}: texto inválido.`);
    if (type === "date" && v && !validDay(v))
      errors.push(`${label}: use AAAA-MM-DD.`);
    if (type === "url" && v && !validSource(v))
      errors.push(`${label}: use um link HTTPS válido.`);
  }
  if (p.exchangeRate !== null && p.exchangeRate <= 0)
    errors.push("A cotação do dólar deve ser positiva.");
  for (const prefix of ["card", "partner"])
    if (
      p[prefix + "VerifiedAt"] &&
      p[prefix + "ExpiresAt"] &&
      p[prefix + "ExpiresAt"] < p[prefix + "VerifiedAt"]
    )
      errors.push("A validade não pode anteceder a verificação.");
  if (
    offer &&
    p.partnerEligibleAmount !== null &&
    p.partnerEligibleAmount > offer.price
  )
    errors.push(
      "A base do parceiro não pode superar o preço do produto; exclua frete e taxas.",
    );
  if (
    offer &&
    Number.isFinite(offer.shipping) &&
    p.cardEligibleAmount !== null &&
    p.cardEligibleAmount > offer.price + offer.shipping + p.fees
  )
    errors.push("A base do cartão não pode superar o total cobrado pela loja.");
  return errors;
}
export const paymentIdentity = (input) => {
  const p = normalizePayment(input);
  return [
    p.method,
    p.installments,
    p.cardName.trim().toLowerCase(),
    p.cardProgram.trim().toLowerCase(),
    p.partnerProgram.trim().toLowerCase(),
    p.requiresClub,
    p.clubMember,
  ];
};
const brazilDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function reward(p, prefix, offer, asOf, quantity) {
  const partner = prefix === "partner",
    program = p[prefix + "Program"],
    rate = p[prefix + "Rate"];
  const result = {
    program,
    points: null,
    value: null,
    status: "none",
    reason: "",
  };
  if (!program && rate === null) return result;
  const pending = (reason) => ({ ...result, status: "pending", reason });
  const excluded = (reason) => ({ ...result, status: "ineligible", reason });
  if (!partner && !p.method) return pending("Informe a forma de pagamento.");
  if (!partner && p.method !== "Cartão de crédito")
    return excluded("Pontos do cartão exigem pagamento com cartão de crédito.");
  if (partner && p.partnerEligibility === "ineligible")
    return excluded("Compra não elegível na campanha.");
  if (partner && p.requiresClub && !p.clubMember)
    return excluded(
      "Taxa exclusiva para assinantes do clube; você não é assinante.",
    );
  if (p[prefix + "ExpiresAt"] && p[prefix + "ExpiresAt"] < asOf)
    return excluded("Regra ou campanha encerrada.");
  if (!program || rate === null)
    return pending("Informe programa e taxa de pontos.");
  if (
    !validSource(p[prefix + "Source"]) ||
    !validDay(p[prefix + "VerifiedAt"]) ||
    p[prefix + "VerifiedAt"] > asOf
  )
    return pending("Faltam fonte oficial e data de verificação válida.");
  if (partner && p.partnerEligibility !== "eligible")
    return pending(
      "Confirme canal, vendedor, produto e demais regras da campanha.",
    );
  if (partner && !p.partnerExpiresAt && p.partnerVerifiedAt !== asOf)
    return pending(
      "Campanha sem término informado: reconfirme a validade hoje.",
    );
  if (!partner && !p.cardUnit)
    return pending("Informe se a taxa do cartão é por real ou por dólar.");
  if (!partner && p.cardUnit === "USD" && !(p.exchangeRate > 0))
    return pending(
      "Informe a cotação usada pelo cartão para pontos por dólar.",
    );
  const base = p[prefix + "EligibleAmount"] ?? offer.price;
  // Freight is excluded by default. An explicit eligible base can include it
  // for the card when its published rules allow that.
  const points = Math.floor(
    (base * quantity * rate) /
      (!partner && p.cardUnit === "USD" ? p.exchangeRate : 1),
  );
  const valuation = p[prefix + "ValuePerThousand"];
  return {
    ...result,
    status: "eligible",
    points,
    value:
      points === 0
        ? 0
        : valuation === null
          ? null
          : round((points * valuation) / 1000),
    reason:
      valuation === null && points > 0
        ? "Defina sua estimativa de valor por 1.000 pontos."
        : "",
  };
}
export function evaluatePayment(
  offer,
  { asOf = brazilDay(), quantity = 1 } = {},
) {
  const p = normalizePayment(offer.payment),
    errors = paymentErrors(p, offer);
  if (errors.length)
    return {
      outlay: null,
      checkout: null,
      benefit: null,
      effective: null,
      rewards: [],
      warnings: errors,
      applied: [],
    };
  const checkout = Number.isFinite(offer.shipping)
    ? round((offer.price + offer.shipping + p.fees) * quantity)
    : null;
  const outlay =
    checkout === null ? null : round(checkout + p.clubCost * quantity);
  const rewards = ["card", "partner"].map((prefix) => ({
    ...reward(p, prefix, offer, asOf, quantity),
    kind: prefix,
  }));
  const warnings = rewards
    .filter((r) => r.reason)
    .map((r) => `${r.program || "Pontos"}: ${r.reason}`);
  let applied = rewards.filter((r) => r.status === "eligible"),
    complete =
      !rewards.some((r) => r.status === "pending") &&
      applied.every((r) => r.value !== null);
  if (applied.filter((r) => r.points > 0).length > 1) {
    if (p.stacking === "unknown") {
      complete = false;
      applied = [];
      warnings.push(
        "Acúmulo conjunto não confirmado: os dois programas não foram somados.",
      );
    } else if (p.stacking === "no") {
      applied = applied.every((r) => r.value !== null)
        ? [...applied].sort((a, b) => b.value - a.value).slice(0, 1)
        : [];
      warnings.push(
        "Programas não cumulativos: considere apenas a alternativa de maior benefício estimado.",
      );
    }
  }
  const benefit = round(applied.reduce((sum, r) => sum + (r.value ?? 0), 0));
  if (outlay === null)
    warnings.push("Frete desconhecido: total e custo estimado indisponíveis.");
  return {
    checkout,
    outlay,
    benefit,
    effective: outlay !== null && complete ? round(outlay - benefit) : null,
    rewards,
    warnings,
    applied: applied.map((r) => r.kind),
  };
}
export function paymentLabel(input) {
  const p = normalizePayment(input);
  return (
    (p.method || "Pagamento não informado") +
    (p.method === "Cartão de crédito"
      ? ` · ${p.installments}x${p.cardName ? " · " + p.cardName : ""}`
      : "")
  );
}
