import { randomUUID } from "node:crypto";
import { getPool } from "./db.mjs";

export const DEFAULT_RESEARCH_MODEL = "gpt-6-luna";

// OpenAI Standard rates in USD per million tokens. The web tool has a
// separate per-call fee. Store the estimate at the time of the request.
const rates = [
  [/^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/, 0.1, 0.01, 0.5],
  [/^gpt-5\.4-nano(?:-\d{4}-\d{2}-\d{2})?$/, 0.2, 0.02, 1.25],
  [/^gpt-4\.1-mini(?:-\d{4}-\d{2}-\d{2})?$/, 0.4, 0.1, 1.6],
];
const webCallUsd = 0.01;
const tokenCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

function usageOf({ model, provider, feature }, result) {
  const reported = result?.totalUsage;
  const input = tokenCount(reported?.inputTokens);
  const cached = tokenCount(reported?.inputTokenDetails?.cacheReadTokens);
  const output = tokenCount(reported?.outputTokens);
  const webCalls = !result
    ? null
    : feature === "research"
      ? result.toolCalls.filter((call) => call.toolName === "web_search").length
      : 0;
  const rate = rates.find(([pattern]) => pattern.test(model));
  // The legacy mini model has a separate fixed search-token billing block,
  // so the returned token count alone does not give a comparable estimate.
  const canEstimate =
    provider === "OpenAI" &&
    rate &&
    input !== null &&
    output !== null &&
    !((webCalls ?? 0) && model.startsWith("gpt-4.1-mini"));
  const discounted = Math.min(cached ?? 0, input ?? 0);
  const estimatedCostUsd = canEstimate
    ? Number(
        (
          ((input - discounted) * rate[1] +
            discounted * rate[2] +
            output * rate[3]) /
            1_000_000 +
          webCalls * webCallUsd
        ).toFixed(9),
      )
    : null;
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    webCalls,
    estimatedCostUsd,
  };
}

export async function beginAiUsage(
  userId,
  feature,
  provider,
  model,
  query = null,
) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO qc_ai_usage(id, user_id, feature, provider, model, query)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, feature, provider, model, query],
  );
  return { id, userId, feature, provider, model };
}

export async function finishAiUsage(entry, status, result) {
  const model =
    entry.provider === "OpenAI"
      ? result?.response?.modelId || entry.model
      : entry.model;
  const usage = usageOf({ ...entry, model }, result);
  await getPool().query(
    `UPDATE qc_ai_usage
     SET model=$3, status=$4, input_tokens=$5, cached_input_tokens=$6,
         output_tokens=$7, web_calls=$8, estimated_cost_usd=$9
     WHERE id=$1 AND user_id=$2`,
    [
      entry.id,
      entry.userId,
      model,
      status,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.webCalls,
      usage.estimatedCostUsd,
    ],
  );
  return { id: entry.id, model, ...usage };
}

export async function listAiUsage(userId, offset) {
  const limit = 25;
  const {
    rows: [row],
  } = await getPool().query(
    `SELECT
      (SELECT json_build_object(
        'requests', count(*),
        'researches', count(*) FILTER (WHERE feature='research'),
        'estimatedCostUsd', sum(estimated_cost_usd),
        'withoutEstimate', count(*) FILTER (WHERE estimated_cost_usd IS NULL)
      ) FROM qc_ai_usage WHERE user_id=$1) AS summary,
      (SELECT coalesce(json_agg(page), '[]') FROM (
        SELECT id, feature, provider, model, query,
          case when status='pending' and created_at < now() - interval '2 minutes'
            then 'failed' else status end as status,
          input_tokens AS "inputTokens", cached_input_tokens AS "cachedInputTokens",
          output_tokens AS "outputTokens", web_calls AS "webCalls",
          estimated_cost_usd AS "estimatedCostUsd", created_at AS "createdAt"
        FROM qc_ai_usage WHERE user_id=$1
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3
      ) page) AS entries`,
    [userId, limit, offset],
  );
  return { ...row, limit };
}
