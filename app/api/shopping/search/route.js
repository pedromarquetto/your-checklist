import { randomUUID } from "node:crypto";
import { normalizeShoppingResults } from "../../../../lib/offers.mjs";
import {
  endpoint,
  checkOrigin,
  requireUser,
  readJSON,
  json,
  HttpError,
} from "../../../../lib/server/http.mjs";
import { getWorkspace, quota } from "../../../../lib/server/workspace.mjs";
import { transaction } from "../../../../lib/server/db.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request) {
  return endpoint(async () => {
    checkOrigin(request);
    const user = await requireUser(request);
    if (
      process.env.SHOPPING_SEARCH_ENABLED !== "true" ||
      !process.env.SERPAPI_API_KEY
    )
      throw new HttpError(
        503,
        "A busca ao vivo ainda não foi conectada. Importe suas pesquisas por CSV ou Excel.",
        "NOT_CONFIGURED",
      );
    const body = await readJSON(request, 10000),
      query = typeof body.query === "string" ? body.query.trim() : "",
      itemId = body.itemId;
    if (
      query.length < 3 ||
      query.length > 200 ||
      typeof itemId !== "string" ||
      itemId.length > 100
    )
      throw new HttpError(
        400,
        "Informe um item e uma busca de 3 a 200 caracteres.",
      );
    const { data } = await getWorkspace(user.id);
    if (
      !Object.values(data.items)
        .flat()
        .some((i) => i.id === itemId)
    )
      throw new HttpError(404, "Item não encontrado.");
    await quota(
      user.id,
      "shopping",
      Number(process.env.SHOPPING_DAILY_LIMIT) || 20,
    );
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      gl: "br",
      hl: "pt",
      google_domain: "google.com.br",
      no_cache: "true",
      api_key: process.env.SERPAPI_API_KEY,
    });
    let payload;
    try {
      const upstream = await fetch(
        "https://serpapi.com/search.json?" + params,
        { cache: "no-store", signal: AbortSignal.timeout(18000) },
      );
      if (!upstream.ok) throw new Error();
      payload = await upstream.json();
      if (payload.error) throw new Error();
    } catch {
      throw new HttpError(
        502,
        "A fonte de ofertas não respondeu. Tente novamente mais tarde.",
      );
    }
    const observedAt = new Date().toISOString(),
      offers = normalizeShoppingResults(payload, itemId, observedAt)
        .slice(0, 50)
        .map((o) => ({ ...o, id: randomUUID() }));
    await transaction(async (client) => {
      const current = await client.query(
        "SELECT data FROM qc_workspaces WHERE user_id=$1 FOR UPDATE",
        [user.id],
      );
      if (
        !Object.values(current.rows[0]?.data.items || {})
          .flat()
          .some((i) => i.id === itemId)
      )
        throw new HttpError(
          409,
          "O item foi removido enquanto a pesquisa era realizada.",
        );
      await client.query(
        "INSERT INTO qc_searches(id,user_id,item_id,records) VALUES($1,$2,$3,$4)",
        [randomUUID(), user.id, itemId, JSON.stringify(offers)],
      );
    });
    return json({
      offers,
      observedAt,
      query,
      source: "Google Shopping via SerpApi",
    });
  });
}
