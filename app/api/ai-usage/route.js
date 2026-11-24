import {
  endpoint,
  HttpError,
  json,
  requireUser,
} from "../../../lib/server/http.mjs";
import { listAiUsage } from "../../../lib/server/ai-usage.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  return endpoint(async () => {
    const user = await requireUser(request);
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new HttpError(400, "Página inválida.");
    return json(await listAiUsage(user.id, offset));
  });
}
