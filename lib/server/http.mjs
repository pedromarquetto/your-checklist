import { getAuth } from "./auth.mjs";
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const json = (value, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function requireUser(request) {
  const auth = getAuth();
  if (!auth)
    throw new HttpError(
      503,
      "A conta ainda não foi configurada.",
      "NOT_CONFIGURED",
    );
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    throw new HttpError(
      401,
      "Entre na sua conta para continuar.",
      "UNAUTHORIZED",
    );
  return session.user;
}
export function checkOrigin(request) {
  const origin = request.headers.get("origin"),
    expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if (origin && origin !== expected)
    throw new HttpError(403, "Origem não permitida.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Origem não permitida.");
}
export async function readJSON(request, max = 3 * 1024 * 1024) {
  const size = Number(request.headers.get("content-length"));
  if (size > max)
    throw new HttpError(413, "O conteúdo ultrapassa o limite permitido.");
  if (!request.body) throw new HttpError(400, "Envie um conteúdo JSON válido.");
  const reader = request.body.getReader();
  let bytes = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      throw new HttpError(413, "O conteúdo ultrapassa o limite permitido.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Envie um conteúdo JSON válido.");
  }
}
export function handleError(error) {
  if (error instanceof HttpError)
    return json({ message: error.message, code: error.code }, error.status);
  console.error("Checklist request failed", {
    name: error.name,
    code: error.code,
  });
  return json(
    { message: "Não foi possível concluir a operação. Tente novamente." },
    500,
  );
}
export async function endpoint(fn) {
  try {
    return await fn();
  } catch (error) {
    return handleError(error);
  }
}
