import { z } from "zod";
import {
  STATUSES,
  METHODS,
  normalize,
  uid,
  safeUrl,
  safeImageUrl,
  parseObservationDate,
  offerFingerprint,
} from "./core.mjs";

const text = (n) => z.string().trim().max(n);
const id = text(100)
  .min(1)
  .refine(
    (v) => !["__proto__", "constructor", "prototype"].includes(v),
    "ID inválido",
  );
const amount = z.number().finite().min(0).max(1e10);
const link = text(3000).refine((v) => !v || !!safeUrl(v), "Link inválido");
const image = text(3000).refine(
  (v) => !v || !!safeImageUrl(v),
  "Imagem inválida",
);
const item = z.object({
  id,
  name: text(160).min(1),
  room: text(80).min(1),
  category: text(80).min(1),
  qty: z.number().int().min(1).max(100000),
  unitBudget: amount,
  status: z.enum(STATUSES),
  priority: z.enum(["Alta", "Média", "Baixa"]),
  parentId: id.nullable().default(null),
  paidTotal: amount.default(0),
  paymentMethod: z.union([z.enum(METHODS), z.literal("")]).default(""),
  installments: z.number().int().min(1).max(120).default(1),
  purchaseDate: text(10).default(""),
  store: text(300).default(""),
  url: link.default(""),
  notes: text(3000).default(""),
});
const project = z.object({
  id,
  name: text(80).min(1),
  description: text(160).default(""),
  budget: amount,
  icon: text(8).default("◇"),
  color: z.enum(["sage", "sand"]).default("sage"),
  rooms: z.array(text(80).min(1)).max(100).default([]),
  categories: z.array(text(80).min(1)).max(200).default([]),
  due: text(10).optional(),
});
const offer = z.object({
  id,
  itemId: id,
  model: text(500).min(1),
  store: text(300),
  price: amount.positive(),
  shipping: amount.nullable().default(null),
  rating: z.number().min(0).max(5).nullable().default(null),
  reviewCount: z.number().int().min(0).max(1e9).nullable().default(null),
  date: text(10),
  observedAt: text(40).nullable().optional(),
  url: link,
  imageUrl: image.default(""),
  currency: z.literal("BRL").default("BRL"),
  delivery: text(1000).default(""),
  provider: text(300).default(""),
  notes: text(3000).default(""),
  source: z.enum(["imported", "live", "demo"]),
});
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    projects: z.array(project).max(50),
    items: z.record(id, z.array(item).max(5000)),
    offers: z.array(offer).max(20000),
    templateFields: z.array(text(100)).max(30).optional(),
  })
  .superRefine((data, ctx) => {
    const fail = (message) => ctx.addIssue({ code: "custom", message });
    const projectIds = new Set(data.projects.map((p) => p.id));
    if (projectIds.size !== data.projects.length) fail("Projetos duplicados.");
    if (Object.keys(data.items).some((k) => !projectIds.has(k)))
      fail("Itens vinculados a projeto inexistente.");
    const allIds = new Set();
    for (const p of data.projects) {
      const items = data.items[p.id] || [],
        byId = new Map(items.map((i) => [i.id, i]));
      for (const i of items) {
        if (allIds.has(i.id)) fail("IDs de itens duplicados.");
        allIds.add(i.id);
        if (i.purchaseDate && !parseObservationDate(i.purchaseDate))
          fail("Data de compra inválida.");
        if (
          ["Comprado", "Recebido"].includes(i.status) &&
          (!i.purchaseDate || !i.paymentMethod)
        )
          fail("Compra sem data ou pagamento.");
        if (i.parentId) {
          const parent = byId.get(i.parentId);
          if (
            !parent ||
            parent.room !== i.room ||
            parent.category !== i.category
          )
            fail("Subitem com pai, ambiente ou categoria inválidos.");
        }
        const visited = new Set();
        let current = i;
        while (current) {
          if (visited.has(current.id)) {
            fail("Hierarquia circular.");
            break;
          }
          visited.add(current.id);
          current = byId.get(current.parentId);
        }
      }
    }
    const offerIds = new Set();
    for (const o of data.offers) {
      if (!allIds.has(o.itemId)) fail("Oferta vinculada a item inexistente.");
      if (offerIds.has(o.id)) fail("Oferta duplicada.");
      offerIds.add(o.id);
      if (!parseObservationDate(o.observedAt || o.date))
        fail("Data de pesquisa inválida.");
    }
  });
export function validateWorkspace(value) {
  const result = workspaceSchema.safeParse(value);
  if (!result.success)
    throw new Error(result.error.issues[0]?.message || "Checklist inválido.");
  return result.data;
}
export function mergeLocalWorkspace(remote, local, migrationId) {
  remote = validateWorkspace(remote);
  local = validateWorkspace(local);
  const projects = [...remote.projects],
    items = { ...remote.items },
    offers = [...remote.offers];
  // A stable migration ID makes retries idempotent without merging unrelated IDs.
  for (const p of local.projects) {
    const projectId = `m-${migrationId}-${p.id}`.slice(0, 100);
    if (projects.some((x) => x.id === projectId)) continue;
    const ids = new Map(
      (local.items[p.id] || []).map((i) => [
        i.id,
        `m-${migrationId}-${i.id}`.slice(0, 100),
      ]),
    );
    projects.push({ ...p, id: projectId, name: p.name });
    items[projectId] = (local.items[p.id] || []).map((i) => ({
      ...i,
      id: ids.get(i.id),
      parentId: i.parentId ? ids.get(i.parentId) : null,
    }));
    offers.push(
      ...local.offers
        .filter((o) => ids.has(o.itemId))
        .map((o) => ({
          ...o,
          id: `m-${migrationId}-${o.id}`.slice(0, 100),
          itemId: ids.get(o.itemId),
        })),
    );
  }
  return validateWorkspace({ ...remote, projects, items, offers });
}

export {
  emptyWorkspace,
  addLiveOffers,
  manageStructure,
} from "./workspace-core.mjs";
