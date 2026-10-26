import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
for (const key of required)
  console.log(`${key}: ${process.env[key] ? "presente" : "ausente"}`);
let valid = required.every((key) => process.env[key]);
if (
  process.env.BETTER_AUTH_SECRET &&
  process.env.BETTER_AUTH_SECRET.length < 32
) {
  console.error(
    "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres aleatórios.",
  );
  valid = false;
}
if (process.env.BETTER_AUTH_URL) {
  try {
    const url = new URL(process.env.BETTER_AUTH_URL);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error();
  } catch {
    console.error(
      "BETTER_AUTH_URL precisa ser uma URL HTTPS (HTTP apenas local).",
    );
    valid = false;
  }
}
console.log(
  "IA:",
  process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY
    ? "configurada"
    : "aguardando credencial",
);
console.log(
  "Busca:",
  process.env.SHOPPING_SEARCH_ENABLED === "true" && process.env.SERPAPI_API_KEY
    ? "configurada"
    : "aguardando credencial/ativação",
);
if (valid) {
  try {
    const { getPool } = await import("../lib/server/db.mjs"),
      pool = getPool();
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
      [
        [
          "user",
          "session",
          "account",
          "verification",
          "rateLimit",
          "qc_workspaces",
          "qc_galleries",
          "qc_media",
          "qc_usage",
          "qc_searches",
        ],
      ],
    );
    console.log("Tabelas:", rows.length, "de 10");
    if (rows.length !== 10) valid = false;
    await pool.end();
  } catch (e) {
    console.error("Banco indisponível:", e.code || e.name);
    valid = false;
  }
}
process.exitCode = valid ? 0 : 1;
