import {
  mapOfferColumns,
  parseCSV,
  prepareOffers,
  safeUrl,
  today,
} from "./core.mjs";
import { normalizePayment, PAYMENT_FIELDS } from "./payments.mjs";

const optionalLoyaltyFields = PAYMENT_FIELDS.filter(
  ([key]) => !["method", "installments", "fees"].includes(key),
);

export function priceSearchPrompt(item, query) {
  const context = {
    item: item.name,
    specs: item.notes || undefined,
    budget: item.unitBudget || undefined,
  };
  return `Consulta principal: ${JSON.stringify(query)}
Contexto do item: ${JSON.stringify(context)}
Use a consulta principal para encontrar produtos. Use as especificações como contexto quando compatíveis com a consulta. O orçamento é uma preferência.
Retorne até 5 ofertas atuais com o cabeçalho abaixo, separado por ponto e vírgula:
nome;loja;preco;link;forma_pagamento;parcelas;frete;nota;avaliacoes;prazo_entrega;observacoes;programa_parceiro;pontos_parceiro_taxa;base_parceiro;fonte_parceiro;verificado_parceiro;validade_parceiro;elegibilidade_parceiro;exige_clube;condicoes_pontos
Preencha nome, loja, preco e link. Use o preço unitário total em reais, com todos os juros da condição anunciada. Escreva números sem separador de milhar, como 4049,00. Use uma linha por condição de pagamento verificada. Informe frete zero só quando confirmado como grátis. Deixe campos desconhecidos vazios.
Preencha os campos de pontos apenas se a mesma busca trouxer um regulamento oficial vigente vinculável à oferta. Use pontos por R$ 1, base sem frete, datas em AAAA-MM-DD e prefira condições para não assinantes. Use eligible só quando confirmar todas as condições da oferta e unknown quando houver dúvida. Priorize anúncios de lojas com preço visível ao usar a ferramenta.`;
}

export function researchSources(result) {
  const sources = [...result.sources];
  for (const { toolName, output } of result.toolResults) {
    if (toolName !== "web_search") continue;
    sources.push(...(output?.sources ?? []));
    const action = output?.action;
    if (action?.url && ["openPage", "findInPage"].includes(action.type))
      sources.push({ url: action.url });
  }
  return sources;
}

function evidenceUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  if (url.username || url.password) return "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.hash = "";
  return url.href;
}
// A model-written URL is not evidence. Every product URL must also occur in the
// web tool's retrieved sources; unsupported loyalty claims remain unconfirmed.
export function prepareResearch(
  text,
  sources,
  item,
  { day = today(), observedAt = new Date().toISOString() } = {},
) {
  const urls = new Set(sources.map((s) => evidenceUrl(s.url)).filter(Boolean));
  const csv = String(text)
    .trim()
    .replace(/^```(?:csv)?\s*\n/i, "")
    .replace(/\n```$/, "");
  if (csv.length > 250000)
    throw new Error("Pesquisa excedeu o limite de tamanho.");
  const rows = parseCSV(csv);
  if (rows.length > 20) throw new Error("Pesquisa excedeu o limite de opções.");
  const columns = mapOfferColumns(Object.keys(rows[0] ?? {}));
  const dateColumn = columns.data_consulta || "data_consulta";
  const offers = [],
    warnings = [];
  for (const row of rows) {
    const datedRow = { ...row, [dateColumn]: row[dateColumn]?.trim() || day };
    let parsed = prepareOffers([datedRow], [item], { itemId: item.id });
    if (parsed.errors.length) {
      const priceRow = { ...datedRow };
      for (const [, , , key] of optionalLoyaltyFields)
        delete priceRow[columns[key]];
      parsed = prepareOffers([priceRow], [item], { itemId: item.id });
      if (!parsed.errors.length)
        warnings.push(
          "Alguns dados de pontos não puderam ser validados. O preço foi mantido.",
        );
    }
    if (parsed.errors.length) {
      warnings.push(
        "Há ofertas com dados inválidos, como preço ausente ou incorreto.",
      );
      continue;
    }
    const o = parsed.offers[0];
    if (!o || o.date !== day) {
      warnings.push(
        "Há ofertas com data de consulta diferente da data de hoje.",
      );
      continue;
    }
    if (!urls.has(evidenceUrl(o.url))) {
      warnings.push(
        "Há ofertas cujo link não foi confirmado pela ferramenta de busca.",
      );
      continue;
    }
    const p = normalizePayment(o.payment);
    // Research does not know which card the user owns or their personal point
    // valuation. Those settings must be supplied by the user, not the model.
    for (const key of Object.keys(p))
      if (key.startsWith("card") || key === "exchangeRate")
        p[key] = normalizePayment()[key];
    p.partnerValuePerThousand = null;
    p.clubMember = false;
    p.clubCost = 0;
    p.stacking = "unknown";
    if (p.partnerProgram && !urls.has(evidenceUrl(p.partnerSource))) {
      p.partnerRate = null;
      p.partnerSource = "";
      p.partnerVerifiedAt = "";
      p.partnerExpiresAt = "";
      p.partnerEligibility = "unknown";
      warnings.push(
        "Parceria sem fonte recuperada: pontuação mantida pendente.",
      );
    }
    if (p.requiresClub) p.partnerEligibility = "unknown";
    offers.push({
      ...o,
      imageUrl: "",
      payment: p,
      source: "live",
      provider: "OpenAI com pesquisa web",
      observedAt,
    });
  }
  return {
    offers,
    discardedOffers: rows.length - offers.length,
    warnings: [...new Set(warnings)],
  };
}
