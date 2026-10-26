import {
  requireUser,
  readJSON,
  checkOrigin,
  endpoint,
  json,
} from "../../../lib/server/http.mjs";
import { getWorkspace, saveWorkspace } from "../../../lib/server/workspace.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  return endpoint(async () => {
    const user = await requireUser(request);
    return json(await getWorkspace(user.id));
  });
}
export async function PUT(request) {
  return endpoint(async () => {
    checkOrigin(request);
    const user = await requireUser(request),
      body = await readJSON(request);
    return json(await saveWorkspace(user.id, body.data, body.revision));
  });
}
