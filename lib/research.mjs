import { parseCSV, prepareOffers, safeUrl, today } from "./core.mjs";
import { normalizePayment } from "./payments.mjs";

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
  const offers = [],
    warnings = [];
  for (const row of rows) {
    const parsed = prepareOffers([row], [item], { itemId: item.id });
    if (parsed.errors.length) {
      warnings.push("Uma opção foi descartada por dados inválidos.");
      continue;
    }
    const o = parsed.offers[0];
    if (!o || o.date !== day || !urls.has(evidenceUrl(o.url))) {
      warnings.push(
        "Uma opção sem fonte recuperada ou consulta de hoje foi descartada.",
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
  return { offers, warnings: [...new Set(warnings)] };
}
