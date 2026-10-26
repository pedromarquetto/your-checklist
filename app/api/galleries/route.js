import {
  endpoint,
  requireUser,
  checkOrigin,
  readJSON,
  json,
} from "../../../lib/server/http.mjs";
import { galleries, changeGallery } from "../../../lib/server/galleries.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  return endpoint(async () => {
    const user = await requireUser(request);
    return json({
      records: await galleries(
        user.id,
        new URL(request.url).searchParams.get("projectId"),
      ),
    });
  });
}
export async function POST(request) {
  return endpoint(async () => {
    checkOrigin(request);
    const user = await requireUser(request),
      body = await readJSON(request);
    return json({
      record: await changeGallery(
        user.id,
        body.projectId,
        body.category,
        body.action,
      ),
    });
  });
}
