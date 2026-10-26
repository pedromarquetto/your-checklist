import { randomUUID, createHash } from "node:crypto";
import { normalize } from "../core.mjs";
import { applyGalleryChange, galleryKey } from "../category-gallery.mjs";
import { transaction, getPool } from "./db.mjs";
import { requireProject, cleanupMedia } from "./workspace.mjs";
import { HttpError } from "./http.mjs";
export async function galleries(userId, projectId) {
  await requireProject(userId, projectId);
  const { rows } = await getPool().query(
    "SELECT record FROM qc_galleries WHERE user_id=$1 AND project_id=$2 ORDER BY category_key",
    [userId, projectId],
  );
  return rows.map((r) => r.record);
}
export async function changeGallery(userId, projectId, category, action) {
  if (
    typeof category !== "string" ||
    !category.trim() ||
    category.length > 80 ||
    !action ||
    !["create", "add", "caption", "remove"].includes(action.type)
  )
    throw new HttpError(400, "Alteração de galeria inválida.");
  if (
    action.type === "add" &&
    (!Array.isArray(action.photos) || action.photos.length > 24)
  )
    throw new HttpError(400, "Envie até 24 imagens.");
  return transaction(async (client) => {
    await client.query(
      "SELECT user_id FROM qc_workspaces WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    await requireProject(userId, projectId, client);
    const { rows } = await client.query(
      "SELECT record FROM qc_galleries WHERE user_id=$1 AND project_id=$2 AND category_key=$3",
      [userId, projectId, normalize(category)],
    );
    if (action.type === "add") {
      const photos = [];
      for (const raw of action.photos) {
        if (
          !raw ||
          typeof raw.id !== "string" ||
          raw.id.length > 100 ||
          typeof raw.src !== "string"
        )
          throw new HttpError(400, "Imagem inválida.");
        let src = raw.src;
        if (src.startsWith("data:")) {
          if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(src))
            throw new HttpError(
              400,
              "Use uma imagem JPEG preparada pelo aplicativo.",
            );
          const bytes = Buffer.from(src.split(",")[1], "base64");
          if (
            bytes.length > 1500000 ||
            bytes.length < 4 ||
            bytes[0] !== 255 ||
            bytes[1] !== 216 ||
            bytes[bytes.length - 2] !== 255 ||
            bytes.at(-1) !== 217
          )
            throw new HttpError(
              400,
              "Imagem inválida ou maior que 1,5 MB após otimização.",
            );
          const hash = createHash("sha256").update(bytes).digest("hex");
          const previous = await client.query(
            "SELECT id FROM qc_media WHERE user_id=$1 AND sha256=$2",
            [userId, hash],
          );
          if (previous.rows.length) src = `/api/media/${previous.rows[0].id}`;
          else {
            const sum = await client.query(
              "SELECT coalesce(sum(octet_length(bytes)),0) AS size FROM qc_media WHERE user_id=$1",
              [userId],
            );
            if (Number(sum.rows[0].size) + bytes.length > 100 * 1024 * 1024)
              throw new HttpError(
                413,
                "Sua conta atingiu 100 MB de referências. Remova imagens para liberar espaço.",
              );
            const saved = await client.query(
              "INSERT INTO qc_media(id,user_id,sha256,bytes) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,sha256) DO UPDATE SET sha256=excluded.sha256 RETURNING id",
              [randomUUID(), userId, hash, bytes],
            );
            src = `/api/media/${saved.rows[0].id}`;
          }
        } else if (src.startsWith("/api/media/")) {
          // Never accept an arbitrary internal ID supplied by another account.
          const own = await client.query(
            "SELECT id FROM qc_media WHERE id::text=$1 AND user_id=$2",
            [src.slice(11), userId],
          );
          if (!own.rows.length)
            throw new HttpError(404, "Imagem não encontrada.");
        }
        photos.push({
          id: raw.id,
          src,
          caption: String(raw.caption || "").slice(0, 240),
          createdAt: new Date().toISOString(),
          width: Number(raw.width) || 0,
          height: Number(raw.height) || 0,
        });
      }
      action = { ...action, photos };
    }
    let record;
    try {
      record = applyGalleryChange(
        rows[0]?.record,
        { projectId, category },
        action,
      );
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    await client.query(
      "INSERT INTO qc_galleries(user_id,project_id,category_key,record) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,project_id,category_key) DO UPDATE SET record=excluded.record",
      [userId, projectId, normalize(category), JSON.stringify(record)],
    );
    await cleanupMedia(client, userId);
    return record;
  });
}
export async function changeGalleryStructure(
  client,
  userId,
  projectId,
  operation,
) {
  if (operation.kind !== "category") return;
  if (operation.remove) {
    await client.query(
      "DELETE FROM qc_galleries WHERE user_id=$1 AND project_id=$2 AND category_key=$3",
      [userId, projectId, normalize(operation.oldName)],
    );
    return;
  }
  const oldKey = normalize(operation.oldName),
    newKey = normalize(operation.name);
  if (newKey !== oldKey) {
    const existing = await client.query(
      "SELECT 1 FROM qc_galleries WHERE user_id=$1 AND project_id=$2 AND category_key=$3",
      [userId, projectId, newKey],
    );
    if (existing.rows.length)
      throw new HttpError(400, "Já existe uma galeria com esse nome.");
  }
  const { rows } = await client.query(
    "SELECT record FROM qc_galleries WHERE user_id=$1 AND project_id=$2 AND category_key=$3",
    [userId, projectId, oldKey],
  );
  if (rows.length) {
    const record = {
      ...rows[0].record,
      key: galleryKey(projectId, operation.name),
      category: operation.name,
    };
    await client.query(
      "UPDATE qc_galleries SET category_key=$4,record=$5 WHERE user_id=$1 AND project_id=$2 AND category_key=$3",
      [userId, projectId, oldKey, newKey, JSON.stringify(record)],
    );
  }
}
