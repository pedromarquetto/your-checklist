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
const assistant = await import("../app/api/assistant/route.js");
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
  await db.exec(
    await readFile(
      new URL("../database/migrations/001_workspace.sql", import.meta.url),
      "utf8",
    ),
  );
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
    assert.match((await response.json()).answer, /voltagem/);
    assert.match(context, /Geladeira/);
    assert.match(context, /3500/);
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
