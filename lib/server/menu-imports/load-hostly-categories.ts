import type { Firestore } from "firebase-admin/firestore";

const DEFAULT_CATEGORY_HINTS = [
  "Entrantes",
  "Principales",
  "Postres",
  "Vinos tintos",
  "Vinos blancos",
  "Vinos por copa",
  "Cócteles",
  "Cervezas",
  "Refrescos",
  "Cafés",
  "Bebidas",
  "General",
];

/**
 * Carga nombres de categorías Hostly conocidas para enriquecimiento IA.
 * Prueba subcolecciones legacy (`restaurantes`) y canónica (`restaurants`).
 */
export async function loadHostlyCategoryNames(
  db: Firestore,
  restaurantId: string,
): Promise<string[]> {
  const rid = restaurantId.trim();
  if (!rid) return DEFAULT_CATEGORY_HINTS;

  const names = new Set<string>();

  const paths = [
    ["restaurantes", rid, "cartaCategorias"],
    ["restaurants", rid, "cartaCategorias"],
    ["restaurantes", rid, "categories"],
    ["restaurants", rid, "categories"],
  ] as const;

  for (const [root, docId, sub] of paths) {
    try {
      const snap = await db.collection(root).doc(docId).collection(sub).limit(80).get();
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const name =
          typeof data.name === "string"
            ? data.name.trim()
            : typeof data.nombre === "string"
              ? data.nombre.trim()
              : "";
        if (name) names.add(name);
      }
    } catch {
      /* ignore missing collection */
    }
  }

  if (names.size === 0) {
    return DEFAULT_CATEGORY_HINTS;
  }

  return [...names].sort((a, b) => a.localeCompare(b, "es"));
}
