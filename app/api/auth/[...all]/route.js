import { getAuth } from "../../../../lib/server/auth.mjs";
import { json } from "../../../../lib/server/http.mjs";
export const runtime = "nodejs";
const handler = (request) =>
  getAuth()?.handler(request) ||
  json(
    { message: "Configure o banco e a autenticação para ativar as contas." },
    503,
  );
export const GET = handler;
export const POST = handler;
