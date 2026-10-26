import { normalize, uid, offerFingerprint } from "./core.mjs";
export function emptyWorkspace() {
  return { version: 1, projects: [], items: {}, offers: [] };
}
export function addLiveOffers(data, offers) {
  const seen = new Set(data.offers.map(offerFingerprint));
  return {
    ...data,
    offers: [
      ...data.offers,
      ...offers
        .filter((o) => {
          const key = offerFingerprint(o);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((o) => ({ ...o, id: o.id || uid() })),
    ],
  };
}
export function manageStructure(
  data,
  projectId,
  { kind, oldName, name, remove = false },
) {
  const p = data.projects.find((p) => p.id === projectId);
  if (!p) throw new Error("Projeto não encontrado.");
  if (kind === "project") {
    if (remove) {
      const ids = new Set((data.items[projectId] || []).map((i) => i.id));
      const items = { ...data.items };
      delete items[projectId];
      return {
        ...data,
        projects: data.projects.filter((x) => x.id !== projectId),
        items,
        offers: data.offers.filter((o) => !ids.has(o.itemId)),
      };
    }
    return {
      ...data,
      projects: data.projects.map((x) =>
        x.id === projectId ? { ...x, name: name.trim() } : x,
      ),
    };
  }
  const field = kind === "room" ? "room" : "category",
    list = kind === "room" ? "rooms" : "categories";
  const names = [
    ...(p[list] || []),
    ...(data.items[projectId] || []).map((i) => i[field]),
  ];
  if (
    !remove &&
    names.some(
      (n) =>
        normalize(n) !== normalize(oldName) && normalize(n) === normalize(name),
    )
  )
    throw new Error("Já existe um nome igual neste projeto.");
  const removedIds = new Set(
    (data.items[projectId] || [])
      .filter((i) => normalize(i[field]) === normalize(oldName))
      .map((i) => i.id),
  );
  const next = (data.items[projectId] || []).flatMap((i) =>
    normalize(i[field]) === normalize(oldName)
      ? remove
        ? []
        : [{ ...i, [field]: name.trim() }]
      : [i],
  );
  return {
    ...data,
    projects: data.projects.map((x) =>
      x.id === projectId
        ? {
            ...x,
            [list]: [
              ...new Set(
                (x[list] || [])
                  .filter((n) => normalize(n) !== normalize(oldName))
                  .concat(remove ? [] : [name.trim()]),
              ),
            ],
          }
        : x,
    ),
    items: { ...data.items, [projectId]: next },
    offers: remove
      ? data.offers.filter((o) => !removedIds.has(o.itemId))
      : data.offers,
  };
}
