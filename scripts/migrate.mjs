import nextEnv from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
nextEnv.loadEnvConfig(process.cwd());
const { authOptions } = await import("../lib/server/auth.mjs");
const { getPool, transaction, configured } =
  await import("../lib/server/db.mjs");
const workspaceOnly = process.argv.includes("--workspace-only");
if (workspaceOnly ? !process.env.DATABASE_URL : !configured()) {
  console.error(
    "Configure DATABASE_URL, BETTER_AUTH_SECRET e BETTER_AUTH_URL antes da migração.",
  );
  process.exitCode = 1;
} else
  try {
    if (!workspaceOnly) {
      const plan = await getMigrations(authOptions());
      if (plan.schemaProblems.length || plan.unsafeChanges.length)
        throw new Error(
          "Revise o plano de migração da autenticação antes de continuar.",
        );
      await plan.runMigrations();
    }
    const directory = new URL("../database/migrations/", import.meta.url);
    const migrations = (await readdir(directory))
      .filter((name) => /^\d+_\w+\.sql$/.test(name))
      .sort();
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(8042671)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS qc_schema_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())",
      );
      for (const file of migrations) {
        const name = file.slice(0, -4);
        const sql = await readFile(new URL(file, directory), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const { rows } = await client.query(
          "SELECT checksum FROM qc_schema_migrations WHERE name=$1",
          [name],
        );
        if (rows.length) {
          if (rows[0].checksum !== checksum)
            throw new Error(`A migração ${name} já aplicada foi alterada.`);
          continue;
        }
        await client.query(sql);
        await client.query(
          "INSERT INTO qc_schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
      }
    });
    console.log("Migrações do Your Checklist aplicadas.");
  } catch (error) {
    console.error("Falha na migração:", error.code || error.name);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
