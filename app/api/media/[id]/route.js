import {
  endpoint,
  requireUser,
  HttpError,
} from "../../../../lib/server/http.mjs";
import { getPool } from "../../../../lib/server/db.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  return endpoint(async () => {
    const user = await requireUser(request),
      { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(404, "Imagem não encontrada.");
    const { rows } = await getPool().query(
      "SELECT bytes FROM qc_media WHERE id=$1 AND user_id=$2",
      [id, user.id],
    );
    if (!rows.length) throw new HttpError(404, "Imagem não encontrada.");
    return new Response(rows[0].bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
