import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { getMigrations } from "better-auth/db/migration";

// Real PostgreSQL in WASM, isolated from Neon and all production credentials.
process.env.DATABASE_URL = "postgres://test:test@localhost/checklist_test";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64url");
const { getPool } = await import("./server/db.mjs");
const pool = getPool(),
  db = new PGlite();
const query = async (text, values) => {
  const result = await db.query(
    typeof text === "string" ? text : text.text,
    values || text.values,
  );
  return {
    rows: result.rows,
    rowCount: result.affectedRows ?? result.rows.length,
  };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const { getAuth, authOptions } = await import("./server/auth.mjs");
const workspace = await import("../app/api/workspace/route.js");
const gallery = await import("../app/api/galleries/route.js");
const media = await import("../app/api/media/[id]/route.js");
const structure = await import("../app/api/structure/route.js");
const shopping = await import("../app/api/shopping/search/route.js");
const research = await import("../app/api/shopping/research/route.js");
const { csvString, OFFER_FIELDS, today } = await import("./core.mjs");
const assistant = await import("../app/api/assistant/route.js");
const aiUsage = await import("../app/api/ai-usage/route.js");
const { emptyWorkspace } = await import("./workspace.mjs");
const base = "http://localhost:3000";
let cookieA,
  cookieB,
  revision = 0;
function req(path, method = "GET", body, cookie = cookieA, origin = base) {
  return new Request(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const fixture = () => ({
  version: 1,
  projects: [{ id: "home", name: "Casa", budget: 5000, rooms: ["Cozinha"] }],
  items: {
    home: [
      {
        id: "fridge",
        name: "Geladeira",
        room: "Cozinha",
        category: "Eletros",
        qty: 1,
        unitBudget: 4000,
        status: "Planejado",
        priority: "Alta",
      },
    ],
  },
  offers: [],
});
before(async () => {
  await db.waitReady;
  const plan = await getMigrations(authOptions());
  await plan.runMigrations();
  for (const file of ["001_workspace.sql", "002_ai_usage.sql"]) {
    await db.exec(
      await readFile(
        new URL(`../database/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  for (const [index, email] of [
    "one@example.test",
    "two@example.test",
  ].entries()) {
    const response = await getAuth().handler(
      req(
        "/api/auth/sign-up/email",
        "POST",
        { email, password: "a-strong-test-password", name: "Test user" },
        null,
      ),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    assert.ok(cookie);
    if (index === 0) cookieA = cookie;
    else cookieB = cookie;
  }
});
after(async () => {
  await pool.end();
  await db.close();
});
test("unauthenticated reads fail; new accounts start empty and data persists by account", async () => {
  assert.equal(
    (await workspace.GET(req("/api/workspace", "GET", undefined, null))).status,
    401,
  );
  const initial = await (await workspace.GET(req("/api/workspace"))).json();
  assert.deepEqual(initial.data, emptyWorkspace());
  const response = await workspace.PUT(
    req("/api/workspace", "PUT", { data: fixture(), revision: 0 }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  revision = (await response.json()).revision;
  const other = await (
    await workspace.GET(req("/api/workspace", "GET", undefined, cookieB))
  ).json();
  assert.deepEqual(other.data, emptyWorkspace());
  assert.equal(
    (await (await workspace.GET(req("/api/workspace"))).json()).data.projects[0]
      .name,
    "Casa",
  );
});
test("conflicting revisions and cross-origin writes cannot overwrite saved data", async () => {
  assert.equal(
    (
      await workspace.PUT(
        req("/api/workspace", "PUT", { data: fixture(), revision: 0 }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await workspace.PUT(
        req(
          "/api/workspace",
          "PUT",
          { data: fixture(), revision },
          cookieA,
          "https://foreign.example",
        ),
      )
    ).status,
    403,
  );
  const bad = fixture();
  bad.items.home[0].parentId = "missing";
  assert.equal(
    (await workspace.PUT(req("/api/workspace", "PUT", { data: bad, revision })))
      .status,
    400,
  );
});
test("private galleries persist, deduplicate uploads and prevent cross-account image access", async () => {
  assert.equal(
    (
      await gallery.GET(
        req("/api/galleries?projectId=home", "GET", undefined, cookieB),
      )
    ).status,
    404,
  );
  // Minimal JPEG envelope exercises binary persistence, not the browser decoder.
  const src =
    "data:image/jpeg;base64," +
    Buffer.from([255, 216, 255, 217]).toString("base64");
  const response = await gallery.POST(
    req("/api/galleries", "POST", {
      projectId: "home",
      category: "Eletros",
      action: {
        type: "add",
        photos: [{ id: "photo1", src, caption: "Referência" }],
      },
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const record = (await response.json()).record,
    id = record.photos[0].src.split("/").at(-1);
  assert.equal(
    (
      await media.GET(req("/api/media/" + id), {
        params: Promise.resolve({ id }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await media.GET(req("/api/media/" + id, "GET", undefined, cookieB), {
        params: Promise.resolve({ id }),
      })
    ).status,
    404,
  );
  const duplicate = await gallery.POST(
    req("/api/galleries", "POST", {
      projectId: "home",
      category: "Eletros",
      action: { type: "add", photos: [{ id: "photo2", src }] },
    }),
  );
  assert.equal((await duplicate.json()).record.photos.length, 1);
  const renamed = await structure.POST(
    req("/api/structure", "POST", {
      projectId: "home",
      revision,
      operation: {
        kind: "category",
        oldName: "Eletros",
        name: "Eletrodomésticos",
        remove: false,
      },
    }),
  );
  assert.equal(renamed.status, 200, await renamed.clone().text());
  revision = (await renamed.json()).revision;
  const list = await (
    await gallery.GET(req("/api/galleries?projectId=home"))
  ).json();
  assert.equal(list.records[0].category, "Eletrodomésticos");
  const state = await (await workspace.GET(req("/api/workspace"))).json();
  assert.equal(state.data.items.home[0].category, "Eletrodomésticos");
});
test("shopping saves query snapshots and enforces durable daily quotas", async () => {
  process.env.SHOPPING_SEARCH_ENABLED = "true";
  process.env.SERPAPI_API_KEY = "test-key";
  process.env.SHOPPING_DAILY_LIMIT = "2";
  const original = globalThis.fetch;
  let price = 3500;
  globalThis.fetch = async () =>
    Response.json({
      shopping_results: [
        {
          product_id: "prod",
          title: "Geladeira teste",
          source: "Loja teste",
          extracted_price: price++,
          product_link: "https://example.com/fridge",
        },
      ],
    });
  try {
    for (let i = 0; i < 2; i++) {
      const response = await shopping.POST(
        req("/api/shopping/search", "POST", {
          query: "Geladeira",
          itemId: "fridge",
        }),
      );
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).offers.length, 1);
    }
    const state = await (await workspace.GET(req("/api/workspace"))).json();
    assert.equal(state.data.offers.length, 2);
    assert.equal(
      (
        await shopping.POST(
          req("/api/shopping/search", "POST", {
            query: "Geladeira",
            itemId: "fridge",
          }),
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await shopping.POST(
          req("/api/shopping/search", "POST", {
            query: "Geladeira",
            itemId: "foreign",
          }),
        )
      ).status,
      404,
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.SERPAPI_API_KEY;
  }
});
test("web research requires credentials, ownership and sources, then persists payment evidence and enforces quota", async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal(
    (
      await research.POST(
        req("/api/shopping/research", "POST", {
          itemId: "fridge",
          query: "Geladeira",
        }),
      )
    ).status,
    503,
  );
  process.env.OPENAI_API_KEY = "test-key";
  process.env.RESEARCH_DAILY_LIMIT = "1";
  assert.equal(
    (
      await research.POST(
        req("/api/shopping/research", "POST", {
          itemId: "foreign",
          query: "Geladeira",
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await research.POST(
        req(
          "/api/shopping/research",
          "POST",
          { itemId: "fridge", query: "Geladeira" },
          cookieB,
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await research.POST(
        req(
          "/api/shopping/research",
          "POST",
          { itemId: "fridge", query: "Geladeira" },
          cookieA,
          "https://foreign.example",
        ),
      )
    ).status,
    403,
  );
  const original = globalThis.fetch;
  let requestBody;
  let outcome = "offers";
  const product = "https://loja.example/geladeira",
    rules = "https://parceiro.example/regras";
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    if (outcome === "error")
      return Response.json(
        { error: { code: "insufficient_quota" } },
        { status: 429 },
      );
    return Response.json({
      id: "resp_research",
      created_at: 1793000000,
      model: "gpt-6-luna",
      output: [
        {
          type: "web_search_call",
          id: "ws_1",
          status: "completed",
          action: {
            type: "open_page",
            url: product,
          },
        },
        {
          type: "message",
          id: "msg_research",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: csvString(
                outcome === "empty"
                  ? []
                  : [
                      {
                        item_id: "fridge",
                        nome: "Geladeira pesquisada",
                        loja: "Loja IA",
                        preco: 3200,
                        frete: 0,
                        link: product,
                        forma_pagamento: "Pix",
                        programa_parceiro: "Livelo",
                        pontos_parceiro_taxa: 2,
                        fonte_parceiro: rules,
                        verificado_parceiro: today(),
                        validade_parceiro: today(),
                        elegibilidade_parceiro: "eligible",
                      },
                    ],
                OFFER_FIELDS,
              ),
              annotations: [
                {
                  type: "url_citation",
                  url: rules,
                  title: "Regulamento da campanha",
                  start_index: 0,
                  end_index: 1,
                },
              ],
            },
          ],
        },
      ],
      usage: {
        input_tokens: 800,
        input_tokens_details: { cached_tokens: 400 },
        output_tokens: 100,
        total_tokens: 900,
      },
    });
  };
  try {
    const response = await research.POST(
      req("/api/shopping/research", "POST", {
        itemId: "fridge",
        query: "Geladeira",
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.offers.length, 1);
    assert.equal(body.offers[0].price, 3200);
    assert.equal(body.offers[0].date, today());
    assert.equal(body.offers[0].url, product);
    assert.equal(body.offers[0].payment.partnerRate, 2);
    assert.equal(body.offers[0].payment.partnerValuePerThousand, null);
    assert.equal(requestBody.tools[0].type, "web_search");
    assert.equal(requestBody.model, "gpt-6-luna");
    assert.equal(requestBody.max_tool_calls, 1);
    assert.equal(requestBody.tools[0].search_context_size, "low");
    assert.ok(requestBody.include.includes("web_search_call.action.sources"));
    assert.equal(body.usage.estimatedCostUsd, 0.010094);
    assert.equal(body.usage.webCalls, 1);
    assert.equal(body.usage.cachedInputTokens, 400);
    const history = await (await aiUsage.GET(req("/api/ai-usage"))).json();
    assert.equal(history.summary.estimatedCostUsd, 0.010094);
    assert.equal(history.summary.researches, 1);
    assert.equal(history.entries[0].id, body.usage.id);
    assert.equal(history.entries[0].query, "Geladeira");
    const foreign = await (
      await aiUsage.GET(req("/api/ai-usage", "GET", undefined, cookieB))
    ).json();
    assert.deepEqual(foreign.entries, []);
    assert.equal(foreign.summary.requests, 0);
    assert.equal(
      (await aiUsage.GET(req("/api/ai-usage", "GET", undefined, null))).status,
      401,
    );
    const current = await (await workspace.GET(req("/api/workspace"))).json();
    assert.equal(
      current.data.offers.find((o) => o.id === body.offers[0].id).payment
        .partnerSource,
      rules,
    );
    // Saving and reloading the JSONB document must retain the new schema too.
    const saved = await workspace.PUT(
      req("/api/workspace", "PUT", {
        data: current.data,
        revision: current.revision,
      }),
    );
    assert.equal(saved.status, 200);
    revision = (await saved.json()).revision;
    assert.equal(
      (
        await research.POST(
          req("/api/shopping/research", "POST", {
            itemId: "fridge",
            query: "Geladeira",
          }),
        )
      ).status,
      429,
    );
    process.env.RESEARCH_DAILY_LIMIT = "3";
    outcome = "empty";
    const empty = await research.POST(
      req("/api/shopping/research", "POST", {
        itemId: "fridge",
        query: "Sem oferta",
      }),
    );
    assert.equal(empty.status, 200);
    const emptyBody = await empty.json();
    assert.deepEqual(emptyBody.offers, []);
    assert.equal(emptyBody.usage.estimatedCostUsd, 0.010094);
    outcome = "error";
    const failure = await research.POST(
      req("/api/shopping/research", "POST", {
        itemId: "fridge",
        query: "Falha teste",
      }),
    );
    assert.equal(failure.status, 502);
    const updatedHistory = await (
      await aiUsage.GET(req("/api/ai-usage"))
    ).json();
    assert.equal(updatedHistory.summary.estimatedCostUsd, 0.020188);
    assert.equal(updatedHistory.summary.withoutEstimate, 1);
    assert.equal(
      updatedHistory.entries.find((entry) => entry.query === "Sem oferta")
        .status,
      "empty",
    );
    assert.equal(
      updatedHistory.entries.find((entry) => entry.query === "Falha teste")
        .status,
      "failed",
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEARCH_DAILY_LIMIT;
  }
});
test("assistant requires a credential, reads owned project context and returns provider text", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  assert.equal(
    (
      await assistant.POST(
        req("/api/assistant", "POST", {
          projectId: "home",
          message: "O que falta?",
        }),
      )
    ).status,
    503,
  );
  process.env.OPENAI_API_KEY = "test-key";
  const original = globalThis.fetch;
  let context = "";
  globalThis.fetch = async (url, options) => {
    context = String(options.body);
    return Response.json({
      id: "resp_test",
      created_at: 1793000000,
      model: "gpt-4.1-mini",
      output: [
        {
          type: "message",
          id: "msg_test",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Confira as medidas e a voltagem da geladeira.",
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
    });
  };
  try {
    const response = await assistant.POST(
      req("/api/assistant", "POST", {
        projectId: "home",
        message: "O que devo conferir?",
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.match(body.answer, /voltagem/);
    assert.equal(body.usage.estimatedCostUsd, 0.000032);
    const history = await (await aiUsage.GET(req("/api/ai-usage"))).json();
    assert.equal(history.summary.requests, 4);
    assert.equal(history.summary.estimatedCostUsd, 0.02022);
    assert.equal(history.entries[0].feature, "assistant");
    assert.equal(history.entries[0].query, null);
    assert.match(context, /Geladeira/);
    assert.match(context, /3501/);
    assert.doesNotMatch(context, /3500/);
    assert.match(context, /paymentAnalysis/);
    assert.match(context, /acúmulo conjunto/);
    assert.equal(
      (
        await assistant.POST(
          req("/api/assistant", "POST", {
            projectId: "foreign",
            message: "O que falta?",
          }),
        )
      ).status,
      404,
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.OPENAI_API_KEY;
  }
});
test("deleting a project cleans its galleries and binary references", async () => {
  const response = await structure.POST(
    req("/api/structure", "POST", {
      projectId: "home",
      revision,
      operation: { kind: "project", remove: true },
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual((await response.json()).data.projects, []);
  assert.equal((await db.query("SELECT * FROM qc_galleries")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM qc_media")).rows.length, 0);
});

test("password changes revoke old credentials and permit a fresh sign-in", async () => {
  const response = await getAuth().handler(
    req(
      "/api/auth/change-password",
      "POST",
      {
        currentPassword: "a-strong-test-password",
        newPassword: "a-new-strong-test-password",
        revokeOtherSessions: true,
      },
      cookieB,
    ),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const old = await getAuth().handler(
    req(
      "/api/auth/sign-in/email",
      "POST",
      { email: "two@example.test", password: "a-strong-test-password" },
      null,
    ),
  );
  assert.equal(old.status, 401);
  const fresh = await getAuth().handler(
    req(
      "/api/auth/sign-in/email",
      "POST",
      { email: "two@example.test", password: "a-new-strong-test-password" },
      null,
    ),
  );
  assert.equal(fresh.status, 200, await fresh.clone().text());
});
