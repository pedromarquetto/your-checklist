import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { today } from "../lib/core.mjs";

export async function runPaymentFlows(browser, base) {
  await mkdir("/tmp/your-checklist-qa", { recursive: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = async () => {
    const r = await context.request.get(base + "/api/workspace");
    assert.equal(r.status(), 200);
    return r.json();
  };
  const saved = async () => {
    await page.waitForTimeout(700);
    await page.getByText("Salvo na sua conta", { exact: false }).waitFor();
  };
  try {
    const signup = await context.request.post(
      base + "/api/auth/sign-up/email",
      {
        headers: { origin: base },
        data: {
          name: "Payment QA",
          email: `payments-${randomBytes(8).toString("hex")}@example.test`,
          password: randomBytes(24).toString("base64url"),
        },
      },
    );
    assert.equal(signup.status(), 200);
    const current = await state(),
      item = {
        id: "light",
        name: "Luminária",
        room: "Sala",
        category: "Iluminação",
        qty: 2,
        unitBudget: 0,
        status: "Planejado",
        priority: "Alta",
        notes: "Altura máxima 30 cm; 220 V",
      };
    const put = await context.request.put(base + "/api/workspace", {
      headers: { origin: base },
      data: {
        revision: current.revision,
        data: {
          version: 1,
          projects: [
            {
              id: "shopping",
              name: "Apartamento",
              mode: "shopping",
              budget: 0,
            },
            { id: "simple", name: "Sem preços", mode: "checklist", budget: 0 },
          ],
          items: {
            shopping: [item],
            simple: [{ ...item, id: "task", name: "Medir janela", qty: 1 }],
          },
          offers: [],
        },
      },
    });
    assert.equal(put.status(), 200);
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Apartamento.", exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: "Buscar opções para Luminária",
        exact: true,
      })
      .click();
    assert.equal(
      await page.getByRole("button", { name: "Exemplos", exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Cadastrar opção", exact: false })
      .click();
    let editor = page.getByRole("region", {
      name: "Configurar oferta e pontos",
      exact: true,
    });
    await editor.getByLabel("Loja", { exact: true }).fill("Loja da pesquisa");
    await editor
      .getByLabel("Preço unitário total (R$)", { exact: true })
      .fill("900");
    await editor
      .getByLabel("Frete por unidade (R$; vazio se desconhecido)", {
        exact: true,
      })
      .fill("25");
    await editor
      .getByLabel("Link da oferta", { exact: true })
      .fill("https://loja.example/luminaria");
    await editor
      .getByLabel("Forma de pagamento", { exact: true })
      .selectOption("Pix");
    await editor
      .getByRole("button", { name: "Salvar oferta e condições", exact: true })
      .click();
    await saved();
    assert.equal((await state()).data.offers.length, 1);
    await page
      .getByRole("button", { name: "Cadastrar outra condição", exact: true })
      .click();
    editor = page.getByRole("region", {
      name: "Configurar oferta e pontos",
      exact: true,
    });
    await editor
      .getByLabel("Preço unitário total (R$)", { exact: true })
      .fill("1000");
    await editor
      .getByLabel("Forma de pagamento", { exact: true })
      .selectOption("Cartão de crédito");
    await editor.getByLabel("Número de parcelas", { exact: true }).fill("10");
    await editor
      .locator("summary")
      .filter({ hasText: "Pontos do cartão" })
      .click();
    await editor
      .getByLabel("Nome do cartão", { exact: true })
      .fill("Meu cartão");
    await editor
      .getByLabel("Programa do cartão", { exact: true })
      .fill("Livelo");
    await editor
      .getByLabel("Pontos do cartão por real ou dólar", { exact: true })
      .fill("2");
    await editor
      .getByLabel("Unidade da taxa do cartão", { exact: true })
      .selectOption("BRL");
    await editor
      .getByLabel("Link das regras do cartão", { exact: true })
      .fill("https://emissor.example/regulamento");
    await editor
      .getByLabel("Data da verificação do cartão", { exact: true })
      .fill(today());
    await editor
      .getByLabel("Sua estimativa em R$ por 1.000 pontos do cartão", {
        exact: true,
      })
      .fill("20");
    await editor
      .locator("summary")
      .filter({ hasText: "Parceria da loja e clube" })
      .click();
    await editor
      .getByLabel("Programa parceiro da loja", { exact: true })
      .fill("Livelo");
    await editor
      .getByLabel("Pontos do parceiro por R$ 1", { exact: true })
      .fill("5");
    await editor
      .getByLabel("Link oficial da campanha / regulamento", { exact: true })
      .fill("https://parceiro.example/regras");
    await editor
      .getByLabel("Data da verificação da parceria", { exact: true })
      .fill(today());
    await editor
      .getByLabel("Último dia da campanha", { exact: true })
      .fill(today());
    await editor
      .getByLabel("Elegibilidade na campanha", { exact: true })
      .selectOption("eligible");
    await editor
      .getByLabel("Esta taxa exige clube", { exact: true })
      .selectOption("sim");
    await editor
      .getByLabel("Sua estimativa em R$ por 1.000 pontos do parceiro", {
        exact: true,
      })
      .fill("20");
    await editor
      .getByRole("button", { name: "Salvar oferta e condições", exact: true })
      .click();
    await saved();
    assert.equal(await page.locator("article.qc-offer").count(), 2);
    await page
      .getByText("Não elegível nesta condição", { exact: true })
      .waitFor();
    const credit = page
      .locator("article.qc-offer")
      .filter({ hasText: "Meu cartão" });
    await credit
      .getByRole("button", { name: "Pagamento e pontos", exact: true })
      .click();
    editor = page.getByRole("region", {
      name: "Configurar oferta e pontos",
      exact: true,
    });
    await editor
      .getByLabel("Esta taxa exige clube", { exact: true })
      .selectOption("nao");
    await editor
      .getByLabel("Acúmulo conjunto de cartão e parceiro", { exact: true })
      .selectOption("yes");
    await editor
      .getByRole("button", { name: "Salvar oferta e condições", exact: true })
      .click();
    await saved();
    const data = (await state()).data;
    assert.equal(data.offers.length, 2);
    assert.equal(
      data.offers.find((o) => o.payment.method === "Cartão de crédito").payment
        .stacking,
      "yes",
    );
    await credit.getByText(/Custo após benefício estimado:/).waitFor();
    await page.screenshot({
      path: "/tmp/your-checklist-qa/payments-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Pesquisar preços e pontos com IA",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Pesquisar com IA", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "aguarda a chave OpenAI" })
      .waitFor();
    assert.equal((await state()).data.offers.length, 2);
    await page.getByRole("button", { name: "Salvas", exact: true }).click();

    await page
      .getByLabel("Ordenar ofertas", { exact: true })
      .selectOption("effective");
    assert.match(
      await page.locator("article.qc-offer").first().innerText(),
      /Meu cartão/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await credit
      .getByRole("button", { name: "Pagamento e pontos", exact: true })
      .click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "payment editor mobile overflow",
    );
    await page.screenshot({
      path: "/tmp/your-checklist-qa/payments-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Cancelar condições", exact: true })
      .click();
    await credit
      .getByRole("button", { name: "Escolher opção", exact: true })
      .click();
    assert.equal(
      await page.locator("input[name=paidTotal]").inputValue(),
      "2050",
    );
    assert.equal(
      await page.locator("select[name=method]").inputValue(),
      "Cartão de crédito",
    );
    assert.equal(
      await page.locator("input[name=installments]").inputValue(),
      "10",
    );
    await page
      .getByRole("button", { name: "Confirmar compra", exact: false })
      .click();
    await saved();
    assert.equal((await state()).data.items.shopping[0].paidTotal, 2050);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".qc-project-nav")
      .filter({ hasText: "Sem preços" })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: /Orçamento do projeto/ })
        .isVisible(),
      false,
    );
    await page
      .getByRole("checkbox", { name: "Concluir Medir janela", exact: true })
      .check();
    await saved();
    assert.equal((await state()).data.items.simple[0].status, "Concluído");
    assert.equal((await state()).data.items.simple[0].purchaseDate, "");
    await page.reload();
    await page
      .locator(".qc-project-nav")
      .filter({ hasText: "Sem preços" })
      .click();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Concluir Medir janela", exact: true })
        .isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Novo item", exact: false }).click();
    await page
      .getByLabel("Nome do item *", { exact: true })
      .fill("Conferir medidas");
    await page.getByRole("button", { name: /Adicionar ao checklist/ }).click();
    await saved();
    const task = (await state()).data.items.simple.find(
      (i) => i.name === "Conferir medidas",
    );
    assert.equal(task.unitBudget, 0);
    assert.equal(task.room, "Geral");
    await page
      .getByRole("button", { name: "Novo checklist", exact: true })
      .click();
    await page
      .getByLabel("Nome do checklist *", { exact: true })
      .fill("Tarefas sem orçamento");
    await page
      .locator('.qc-modal select[name="mode"]')
      .selectOption("checklist");
    assert.equal(
      await page.locator('.qc-modal input[name="budget"]').count(),
      0,
    );
    await page.getByRole("button", { name: /Criar checklist →/ }).click();
    await saved();
    assert.equal(
      (await state()).data.projects.find(
        (p) => p.name === "Tarefas sem orçamento",
      ).mode,
      "checklist",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Payment flows passed: manual Pix/card alternatives, evidence and club eligibility, effective ranking, mobile editor, full purchase amount, simple completion and zero-budget tasks persisted.",
    );
  } finally {
    await context.close();
  }
}
