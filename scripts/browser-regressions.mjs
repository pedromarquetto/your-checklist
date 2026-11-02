import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let regressionSession;
async function workspace(context, base) {
  const response = await context.request.get(base + "/api/workspace");
  assert.equal(response.status(), 200);
  return response.json();
}
async function saved(page) {
  await delay(650);
  await page.getByText("Salvo na sua conta", { exact: false }).waitFor();
}
async function fixture(browser, base) {
  // Share a synthetic account across fresh browser contexts so the test suite
  // does not intentionally exceed the application's signup rate limit.
  const context = await browser.newContext(
    regressionSession ? { storageState: regressionSession } : {},
  );
  if (!regressionSession) {
    const response = await context.request.post(
      base + "/api/auth/sign-up/email",
      {
        headers: { origin: base },
        data: {
          name: "Regression test",
          email: `reg-${randomBytes(8).toString("hex")}@example.test`,
          password: randomBytes(24).toString("base64url"),
        },
      },
    );
    assert.equal(response.status(), 200);
    regressionSession = await context.storageState();
  }
  const current = await workspace(context, base);
  const item = {
    room: "Cozinha",
    category: "Móveis",
    qty: 1,
    unitBudget: 100,
    status: "Planejado",
    priority: "Média",
  };
  const data = {
    version: 1,
    projects: [
      { id: "home", name: "Regressões", budget: 5000, rooms: ["Cozinha"] },
    ],
    items: {
      home: [
        { ...item, id: "parent", name: "Armário" },
        { ...item, id: "child", name: "Módulo", parentId: "parent" },
      ],
    },
    offers: [],
  };
  const seeded = await context.request.put(base + "/api/workspace", {
    headers: { origin: base },
    data: { data, revision: current.revision },
  });
  assert.equal(seeded.status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Regressões.", exact: true })
    .waitFor();
  await saved(page);
  return { context, page };
}
async function editSubitem(browser, base) {
  const { context, page } = await fixture(browser, base);
  try {
    await page
      .getByRole("button", { name: "Expandir subitens", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir Módulo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar item", exact: true })
      .click();
    for (const field of ["room", "category"])
      assert.equal(
        await page
          .locator(`input[name="${field}"]`)
          .evaluate((input) => input.readOnly),
        true,
        `Editing a child must keep ${field} inherited from its parent`,
      );
    await page
      .getByLabel("Nome do item *", { exact: true })
      .fill("Módulo editado");
    await page
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await saved(page);
    let data = (await workspace(context, base)).data;
    assert.equal(
      data.items.home.find((i) => i.id === "child").name,
      "Módulo editado",
    );
    assert.equal(
      data.items.home.find((i) => i.id === "child").parentId,
      "parent",
    );
    await page
      .getByRole("button", { name: "Abrir Armário", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar item", exact: true })
      .click();
    await page.locator('input[name="room"]').fill("Sala");
    await page.locator('input[name="category"]').fill("Estantes");
    await page
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await saved(page);
    data = (await workspace(context, base)).data;
    assert.ok(
      data.items.home.every(
        (i) => i.room === "Sala" && i.category === "Estantes",
      ),
    );
    console.log(
      "Regression passed: edited subitems retain their parent scope; parent edits propagate.",
    );
  } finally {
    await context.close();
  }
}
async function focusRace(browser, base) {
  const { context, page } = await fixture(browser, base);
  let release = () => {};
  try {
    for (const [trigger, finishSaveBeforeResponse] of [
      ["focus", false],
      ["focus", true],
      ["manual", false],
      ["manual", true],
    ]) {
      const concurrentDevice = trigger === "focus" && !finishSaveBeforeResponse;
      if (concurrentDevice) {
        const current = await workspace(context, base);
        current.data.projects[0].budget = 6100;
        const remote = await context.request.put(base + "/api/workspace", {
          headers: { origin: base },
          data: { data: current.data, revision: current.revision },
        });
        assert.equal(remote.status(), 200);
      }
      let capture;
      const captured = new Promise((resolve) => {
        capture = resolve;
      });
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let holdNext = true;
      await page.route("**/api/workspace", async (route) => {
        if (route.request().method() !== "GET" || !holdNext)
          return route.continue();
        holdNext = false;
        const response = await route.fetch();
        capture();
        await held;
        await route.fulfill({ response });
      });
      if (trigger === "focus")
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      else
        await page
          .getByRole("button", { name: "Atualizar", exact: true })
          .click();
      await captured;
      const expected = finishSaveBeforeResponse ? 6600 : 6400;
      await page.getByRole("button", { name: /Orçamento do projeto/ }).click();
      await page
        .getByLabel("Quanto você pretende investir? (R$)")
        .fill(String(expected));
      await page
        .getByRole("button", { name: "Salvar orçamento", exact: true })
        .click();
      if (finishSaveBeforeResponse) await saved(page);
      else
        await page
          .getByText("Alterações pendentes", { exact: false })
          .waitFor();
      release();
      if (concurrentDevice) {
        await page
          .getByRole("button", {
            name: "Carregar versão da nuvem",
            exact: true,
          })
          .waitFor();
        const pending = await page.evaluate(() =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith("your-checklist-pending-"))
            .map((key) => JSON.parse(localStorage.getItem(key)).data),
        );
        assert.equal(
          pending[0].projects[0].budget,
          expected,
          "The local recovery copy must retain the user's edit",
        );
        assert.equal(
          (await workspace(context, base)).data.projects[0].budget,
          6100,
          "A concurrent device's save must not be overwritten",
        );
      } else {
        await saved(page);
        assert.equal(
          (await workspace(context, base)).data.projects[0].budget,
          expected,
        );
      }
      await page.getByRole("button", { name: /Orçamento do projeto/ }).click();
      assert.equal(
        await page
          .getByLabel("Quanto você pretende investir? (R$)")
          .inputValue(),
        String(expected),
        "A stale focus response must not roll the UI back after a newer save completed",
      );
      await page
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await page.unroute("**/api/workspace");
      if (concurrentDevice) {
        page.once("dialog", (dialog) => dialog.accept());
        await page
          .getByRole("button", {
            name: "Carregar versão da nuvem",
            exact: true,
          })
          .click();
        await saved(page);
        assert.equal(
          (await workspace(context, base)).data.projects[0].budget,
          6100,
        );
      }
    }
    console.log(
      "Regression passed: focus refresh preserves pending and newly saved edits.",
    );
  } finally {
    release();
    await context.close();
  }
}
async function backupImport(browser, base) {
  const { context, page } = await fixture(browser, base);
  try {
    const a = "p".repeat(99) + "a",
      b = "p".repeat(99) + "b";
    const backup = {
      version: 1,
      projects: [
        { id: a, name: "Backup A", budget: 100 },
        { id: b, name: "Backup B", budget: 200 },
      ],
      items: { [a]: [], [b]: [] },
      offers: [],
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByLabel("Arquivo de backup").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      await saved(page);
      const result = (await workspace(context, base)).data;
      assert.equal(
        result.projects.length,
        3,
        "The original project and both imported projects must survive retries",
      );
      assert.ok(result.projects.some((p) => p.name === "Backup A"));
      assert.ok(result.projects.some((p) => p.name === "Backup B"));
    }
    console.log(
      "Regression passed: browser backup import preserves long project IDs and stays idempotent.",
    );
  } finally {
    await context.close();
  }
}
export async function runBrowserRegressions(browser, base, selected = "all") {
  if (selected === "all" || selected === "edit-subitem")
    await editSubitem(browser, base);
  if (selected === "all" || selected === "focus")
    await focusRace(browser, base);
  if (selected === "all" || selected === "backup")
    await backupImport(browser, base);
}
