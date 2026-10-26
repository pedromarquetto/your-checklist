import {
  endpoint,
  requireUser,
  checkOrigin,
  readJSON,
  json,
  HttpError,
} from "../../../lib/server/http.mjs";
import { transaction } from "../../../lib/server/db.mjs";
import {
  requireProject,
  cleanupMedia,
  withSearchHistory,
} from "../../../lib/server/workspace.mjs";
import { changeGalleryStructure } from "../../../lib/server/galleries.mjs";
import { manageStructure, validateWorkspace } from "../../../lib/workspace.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  return endpoint(async () => {
    checkOrigin(request);
    const user = await requireUser(request),
      body = await readJSON(request, 16000),
      op = body.operation;
    if (
      !op ||
      !["project", "room", "category"].includes(op.kind) ||
      typeof op.remove !== "boolean" ||
      (!op.remove &&
        (typeof op.name !== "string" ||
          !op.name.trim() ||
          op.name.length > (op.kind === "project" ? 80 : 80))) ||
      (op.kind !== "project" &&
        (typeof op.oldName !== "string" || op.oldName.length > 80))
    )
      throw new HttpError(400, "Alteração inválida.");
    return json(
      await transaction(async (client) => {
        const { rows } = await client.query(
          "SELECT data,revision FROM qc_workspaces WHERE user_id=$1 FOR UPDATE",
          [user.id],
        );
        if (rows[0]?.revision !== body.revision)
          throw new HttpError(
            409,
            "Salve ou recarregue antes de alterar a organização.",
            "CONFLICT",
          );
        await requireProject(user.id, body.projectId, client);
        const currentData = await withSearchHistory(
          user.id,
          rows[0].data,
          client,
        );
        let data;
        try {
          data = validateWorkspace(
            manageStructure(currentData, body.projectId, op),
          );
        } catch (e) {
          throw new HttpError(400, e.message);
        }
        await changeGalleryStructure(client, user.id, body.projectId, op);
        const saved = await client.query(
          "UPDATE qc_workspaces SET data=$2,revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision",
          [user.id, JSON.stringify(data)],
        );
        await client.query(
          "DELETE FROM qc_galleries WHERE user_id=$1 AND NOT(project_id=ANY($2::text[]))",
          [user.id, data.projects.map((p) => p.id)],
        );
        await client.query(
          "DELETE FROM qc_searches WHERE user_id=$1 AND NOT(item_id=ANY($2::text[]))",
          [
            user.id,
            Object.values(data.items)
              .flat()
              .map((i) => i.id),
          ],
        );
        await cleanupMedia(client, user.id);
        return { data, revision: saved.rows[0].revision };
      }),
    );
  });
}
