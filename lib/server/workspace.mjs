import { getPool, transaction } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { emptyWorkspace, validateWorkspace } from "../workspace.mjs";
export async function getWorkspace(userId) {
  await getPool().query(
    "INSERT INTO qc_workspaces(user_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [userId, JSON.stringify(emptyWorkspace())],
  );
  const { rows } = await getPool().query(
    "SELECT data,revision FROM qc_workspaces WHERE user_id=$1",
    [userId],
  );
  return { ...rows[0], data: await withSearchHistory(userId, rows[0].data) };
}
export async function withSearchHistory(userId, data, client = getPool()) {
  const searches = await client.query(
    "SELECT records FROM qc_searches WHERE user_id=$1 ORDER BY created_at",
    [userId],
  );
  const ids = new Set(
    Object.values(data.items)
      .flat()
      .map((i) => i.id),
  );
  const seen = new Set(data.offers.map((o) => o.id));
  return {
    ...data,
    offers: [
      ...data.offers,
      ...searches.rows
        .flatMap((r) => r.records)
        .filter((o) => ids.has(o.itemId) && !seen.has(o.id)),
    ],
  };
}
export async function saveWorkspace(userId, raw, revision) {
  let data;
  try {
    data = validateWorkspace(raw);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  if (!Number.isInteger(revision) || revision < 0)
    throw new HttpError(400, "Versão inválida.");
  return transaction(async (client) => {
    const { rows } = await client.query(
      "UPDATE qc_workspaces SET data=$2,revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$3 RETURNING revision",
      [userId, JSON.stringify(data), revision],
    );
    if (!rows.length)
      throw new HttpError(
        409,
        "O checklist foi atualizado em outra aba ou dispositivo. Suas alterações locais foram preservadas.",
        "CONFLICT",
      );
    await client.query(
      "DELETE FROM qc_galleries WHERE user_id=$1 AND NOT (project_id=ANY($2::text[]))",
      [userId, data.projects.map((p) => p.id)],
    );
    await client.query(
      "DELETE FROM qc_searches WHERE user_id=$1 AND NOT(item_id=ANY($2::text[]))",
      [
        userId,
        Object.values(data.items)
          .flat()
          .map((i) => i.id),
      ],
    );
    await cleanupMedia(client, userId);
    return { revision: rows[0].revision };
  });
}
export async function requireProject(userId, projectId, client = getPool()) {
  const { rows } = await client.query(
    "SELECT data FROM qc_workspaces WHERE user_id=$1",
    [userId],
  );
  const data = rows[0]?.data;
  if (!data?.projects.some((p) => p.id === projectId))
    throw new HttpError(404, "Projeto não encontrado.");
  return data;
}
export async function cleanupMedia(client, userId) {
  await client.query(
    "DELETE FROM qc_media m WHERE m.user_id=$1 AND NOT EXISTS (SELECT 1 FROM qc_galleries g, jsonb_array_elements(g.record->'photos') p WHERE g.user_id=m.user_id AND p->>'src'='/api/media/'||m.id::text)",
    [userId],
  );
}
export async function quota(userId, feature, limit) {
  const { rows } = await getPool().query(
    "INSERT INTO qc_usage(user_id,feature,day,count) VALUES($1,$2,current_date,1) ON CONFLICT(user_id,feature,day) DO UPDATE SET count=qc_usage.count+1 WHERE qc_usage.count<$3 RETURNING count",
    [userId, feature, limit],
  );
  if (!rows.length)
    throw new HttpError(
      429,
      "Você atingiu o limite diário desta função. Tente novamente amanhã.",
      "DAILY_LIMIT",
    );
}
