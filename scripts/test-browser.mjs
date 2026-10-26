import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import * as XLSX from "xlsx";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Full local stack: Chromium -> production Next.js -> pg/TCP -> PostgreSQL WASM.
// No production credentials or third-party provider calls are used.
const db = await PGlite.create(),
  socket = new PGLiteSocketServer({
    db,
    port: 0,
    host: "127.0.0.1",
    maxConnections: 20,
  });
await socket.start();
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`,
  env = {
    ...process.env,
    DATABASE_URL: `postgres://postgres:postgres@${socket.getServerConn()}/postgres`,
    BETTER_AUTH_URL: base,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    OPENAI_API_KEY: "",
    AI_GATEWAY_API_KEY: "",
    SERPAPI_API_KEY: "",
    SHOPPING_SEARCH_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
let server,
  browser,
  serverLog = "";
const errors = [];
function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("exit", (code) =>
      code === 0 ? resolve(log) : reject(new Error(log)),
    );
    child.on("error", reject);
  });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, label) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await fn()) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out: " + label);
}
async function state(page) {
  const response = await page.request.get(base + "/api/workspace");
  assert.equal(response.status(), 200);
  return response.json();
}
async function saved(page) {
  // The UI debounces writes by 500 ms; allow the new render to enter that cycle.
  await delay(650);
  await waitFor(
    async () =>
      (await page.getByText("Salvo na sua conta", { exact: false }).count()) >
      0,
    "workspace saved",
  );
}
try {
  await command(["scripts/migrate.mjs"]);
  await command(["scripts/migrate.mjs"]);
  await command(["scripts/check-config.mjs"]);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => (serverLog += chunk));
  server.stderr.on("data", (chunk) => (serverLog += chunk));
  await waitFor(async () => (await fetch(base)).ok, "Next.js ready");
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      chromium.executablePath(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(12000);
  await page.goto(base);
  await page
    .getByRole("button", { name: "Criar uma conta", exact: true })
    .click();
  await page.getByLabel("Seu nome", { exact: true }).fill("Teste V1");
  await page.getByLabel("E-mail", { exact: true }).fill("browser@example.test");
  await page.getByLabel(/Senha/).fill("browser-test-password-123");
  await page
    .getByRole("button", { name: "Criar minha conta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Qual é o seu próximo plano?" })
    .waitFor();
  await page.getByLabel("Nome do checklist").fill("Apartamento QA");
  await page.getByLabel("Orçamento (R$)", { exact: true }).fill("5000");
  await page
    .getByRole("button", { name: "Criar checklist", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "Novo item", exact: false }).click();
  await page.getByLabel("Nome do item *", { exact: true }).fill("Geladeira");
  await page.getByLabel("Ambiente *", { exact: true }).fill("Cozinha");
  await page.getByLabel("Categoria *", { exact: true }).fill("Eletros");
  await page
    .getByLabel("Valor previsto unitário (R$)", { exact: true })
    .fill("4000");
  await page.getByRole("button", { name: /Adicionar ao checklist/ }).click();
  await saved(page);
  assert.equal((await state(page)).data.projects[0].name, "Apartamento QA");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        ambiente: "Sala",
        categoria: "Móveis",
        item: "Sofá",
        quantidade: 1,
        valor_previsto_unitario: 800,
      },
    ]),
    "Itens",
  );
  await page
    .getByRole("button", { name: "Importar planilha", exact: false })
    .click();
  await page
    .locator('input[type=file][accept=".csv,.xlsx,.xls"]')
    .setInputFiles({
      name: "itens.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    });
  await page.getByRole("button", { name: /Importar itens/ }).click();
  await saved(page);
  assert.equal(Object.values((await state(page)).data.items).flat().length, 2);
  await page
    .getByRole("checkbox", {
      name: "Registrar compra de Geladeira",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Valor pago total, com frete (R$) *", { exact: true })
    .fill("3800");
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await saved(page);
  assert.equal(
    Object.values((await state(page)).data.items)
      .flat()
      .find((i) => i.name === "Geladeira").paidTotal,
    3800,
  );
  await page.getByRole("button", { name: "Galerias", exact: false }).click();
  await page
    .getByLabel("Categoria da galeria", { exact: true })
    .selectOption("Eletros");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6b8570";
    ctx.fillRect(0, 0, 800, 500);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Arquivos de referência da categoria", { exact: true })
    .setInputFiles({
      name: "cozinha.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await page.getByLabel("Legenda da referência 1", { exact: true }).waitFor();
  await page
    .getByLabel("Legenda da referência 1", { exact: true })
    .fill("Referência da cozinha");
  await page.getByLabel("Categoria da galeria", { exact: true }).focus();
  await waitFor(async () => {
    const response = await page.request.get(
      base +
        "/api/galleries?projectId=" +
        encodeURIComponent((await state(page)).data.projects[0].id),
    );
    return (
      (await response.json()).records[0]?.photos[0]?.caption ===
      "Referência da cozinha"
    );
  }, "caption persisted");
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page.getByRole("button", { name: "Gerenciar", exact: true }).click();
  const rename = page.locator("form.qc-manage-row").filter({
    has: page.getByRole("textbox", { name: "Nome de Eletros", exact: true }),
  });
  await rename.getByRole("textbox").fill("Eletrodomésticos");
  await rename.getByRole("button", { name: "Renomear", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nome de Eletrodomésticos", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("heading", { name: "Apartamento QA.", exact: true })
    .waitFor();
  await saved(page);
  const stored = await state(page);
  assert.equal(
    Object.values(stored.data.items)
      .flat()
      .find((i) => i.name === "Geladeira").category,
    "Eletrodomésticos",
  );
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base);
  await phone
    .getByLabel("E-mail", { exact: true })
    .fill("browser@example.test");
  await phone
    .getByLabel("Senha", { exact: true })
    .fill("browser-test-password-123");
  await phone.getByRole("button", { name: "Entrar", exact: true }).click();
  await phone
    .getByRole("heading", { name: "Apartamento QA.", exact: true })
    .waitFor();
  await saved(phone);
  assert.equal(Object.values((await state(phone)).data.items).flat().length, 2);
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile viewport overflow",
  );
  await phone.getByRole("button", { name: "Galerias", exact: false }).click();
  await phone
    .getByLabel("Categoria da galeria", { exact: true })
    .selectOption("Eletrodomésticos");
  const image = phone.locator(".qc-reference-thumbnail img");
  await image.waitFor();
  await waitFor(
    () =>
      image.evaluate((element) => element.complete && element.naturalWidth > 0),
    "private image on second device",
  );
  await phone
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await mkdir("/tmp/your-checklist-qa", { recursive: true });
  await page.screenshot({
    path: "/tmp/your-checklist-qa/desktop.png",
    fullPage: true,
  });
  await phone.screenshot({
    path: "/tmp/your-checklist-qa/mobile.png",
    fullPage: true,
  });
  // Two forms loaded at the same revision; one must conflict instead of overwrite.
  await page.getByRole("button", { name: /Orçamento do projeto/ }).click();
  await phone.getByRole("button", { name: /Orçamento do projeto/ }).click();
  await page.getByLabel("Quanto você pretende investir? (R$)").fill("6100");
  await phone.getByLabel("Quanto você pretende investir? (R$)").fill("6200");
  await Promise.all([
    page.getByRole("button", { name: "Salvar orçamento", exact: true }).click(),
    phone
      .getByRole("button", { name: "Salvar orçamento", exact: true })
      .click(),
  ]);
  await waitFor(
    async () =>
      (await page
        .getByRole("button", { name: "Carregar versão da nuvem", exact: true })
        .count()) +
        (await phone
          .getByRole("button", {
            name: "Carregar versão da nuvem",
            exact: true,
          })
          .count()) >
      0,
    "conflict surfaced",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser flow passed: signup, empty project, items, real XLSX upload, purchase, private image upload, captions, rename, reload, second-device login, responsive layout and conflict protection.",
  );
} catch (error) {
  console.error(error);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await socket.stop();
  await delay(250);
  await db.close();
}
