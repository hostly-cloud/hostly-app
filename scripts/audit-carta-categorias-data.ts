/**
 * Auditoría read-only: cartaCategorias en restaurantes vs restaurants.
 * Uso: npx tsx scripts/audit-carta-categorias-data.ts
 */
import fs from "node:fs";
import path from "node:path";

const SUB = "cartaCategorias";

function loadEnv() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const envPath = path.join(repoRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}

function normName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type RootKind = "restaurantes" | "restaurants";

function parseCategoryPath(refPath: string): { root: RootKind; restaurantId: string; categoryId: string } | null {
  const m = refPath.match(/^(restaurantes|restaurants)\/([^/]+)\/cartaCategorias\/([^/]+)$/);
  if (!m) return null;
  return { root: m[1] as RootKind, restaurantId: m[2], categoryId: m[3] };
}

function parseCentralProductPath(refPath: string): { restaurantId: string; productId: string } | null {
  const m = refPath.match(/^restaurants\/([^/]+)\/products\/([^/]+)$/);
  if (!m) return null;
  return { restaurantId: m[1], productId: m[2] };
}

async function main() {
  loadEnv();
  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) {
    console.error(JSON.stringify({ ok: false, error: "Firestore Admin no configurado" }, null, 2));
    process.exit(1);
  }

  const tenantIds = new Set<string>();

  const [restaurantsRootsSnap, restaurantesRootsSnap] = await Promise.all([
    db.collection("restaurants").select().get(),
    db.collection("restaurantes").select().get(),
  ]);
  for (const d of restaurantsRootsSnap.docs) tenantIds.add(d.id);
  for (const d of restaurantesRootsSnap.docs) tenantIds.add(d.id);

  type CatRow = {
    id: string;
    name: string;
    isActive: boolean;
  };

  const byTenantRoot = new Map<string, { restaurantes: Map<string, CatRow>; restaurants: Map<string, CatRow> }>();

  function ensureTenant(rid: string) {
    if (!byTenantRoot.has(rid)) {
      byTenantRoot.set(rid, { restaurantes: new Map(), restaurants: new Map() });
    }
    return byTenantRoot.get(rid)!;
  }

  let totalRestaurantes = 0;
  let totalRestaurants = 0;

  try {
    const cg = await db.collectionGroup(SUB).get();
    for (const doc of cg.docs) {
      const parsed = parseCategoryPath(doc.ref.path);
      if (!parsed) continue;
      tenantIds.add(parsed.restaurantId);
      const bucket = ensureTenant(parsed.restaurantId);
      const data = doc.data() as Record<string, unknown>;
      const name =
        typeof data.name === "string"
          ? data.name.trim()
          : typeof data.nombre === "string"
            ? data.nombre.trim()
            : "";
      const row: CatRow = {
        id: parsed.categoryId,
        name,
        isActive: data.isActive !== false,
      };
      if (parsed.root === "restaurantes") {
        bucket.restaurantes.set(parsed.categoryId, row);
        totalRestaurantes += 1;
      } else {
        bucket.restaurants.set(parsed.categoryId, row);
        totalRestaurants += 1;
      }
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "collectionGroup cartaCategorias failed",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exit(1);
  }

  let tenantsSoloRestaurantes = 0;
  let tenantsSoloRestaurants = 0;
  let tenantsAmbos = 0;
  let tenantsNinguno = 0;

  const sameIdsCrossRoot: Array<{ restaurantId: string; categoryId: string }> = [];
  const sameNameDistId: Array<{
    restaurantId: string;
    normalizedName: string;
    restaurantesIds: string[];
    restaurantsIds: string[];
  }> = [];

  for (const rid of tenantIds) {
    const bucket = byTenantRoot.get(rid) ?? { restaurantes: new Map(), restaurants: new Map() };
    const hasR = bucket.restaurantes.size > 0;
    const hasC = bucket.restaurants.size > 0;
    if (hasR && hasC) tenantsAmbos += 1;
    else if (hasR) tenantsSoloRestaurantes += 1;
    else if (hasC) tenantsSoloRestaurants += 1;
    else tenantsNinguno += 1;

    for (const id of bucket.restaurantes.keys()) {
      if (bucket.restaurants.has(id)) {
        sameIdsCrossRoot.push({ restaurantId: rid, categoryId: id });
      }
    }

    const nameToRestaurantes = new Map<string, string[]>();
    const nameToRestaurants = new Map<string, string[]>();
    for (const [id, row] of bucket.restaurantes) {
      if (!row.name) continue;
      const k = normName(row.name);
      const arr = nameToRestaurantes.get(k) ?? [];
      arr.push(id);
      nameToRestaurantes.set(k, arr);
    }
    for (const [id, row] of bucket.restaurants) {
      if (!row.name) continue;
      const k = normName(row.name);
      const arr = nameToRestaurants.get(k) ?? [];
      arr.push(id);
      nameToRestaurants.set(k, arr);
    }
    const allNames = new Set([...nameToRestaurantes.keys(), ...nameToRestaurants.keys()]);
    for (const n of allNames) {
      const rIds = [...new Set(nameToRestaurantes.get(n) ?? [])];
      const cIds = [...new Set(nameToRestaurants.get(n) ?? [])];
      const allIds = [...new Set([...rIds, ...cIds])];
      if (allIds.length > 1) {
        sameNameDistId.push({
          restaurantId: rid,
          normalizedName: n,
          restaurantesIds: rIds,
          restaurantsIds: cIds,
        });
      }
    }
  }

  const categoryRefCount = new Map<string, number>();
  let productsScanned = 0;
  let productsWithCategoryId = 0;
  let categoryIdPointsRestaurantes = 0;
  let categoryIdPointsRestaurants = 0;
  let categoryIdPointsBoth = 0;
  let categoryIdPointsNeither = 0;

  const orphanCategoryIds = new Map<string, { restaurantId: string; categoryId: string; productCount: number }>();

  try {
    const prodCg = await db.collectionGroup("products").get();
    for (const doc of prodCg.docs) {
      const parsed = parseCentralProductPath(doc.ref.path);
      if (!parsed) continue;
      tenantIds.add(parsed.restaurantId);
      productsScanned += 1;
      const data = doc.data() as Record<string, unknown>;
      const categoryId =
        typeof data.categoryId === "string" && data.categoryId.trim() ? data.categoryId.trim() : null;
      if (!categoryId) continue;
      productsWithCategoryId += 1;

      const bucket = byTenantRoot.get(parsed.restaurantId) ?? {
        restaurantes: new Map(),
        restaurants: new Map(),
      };
      const inR = bucket.restaurantes.has(categoryId);
      const inC = bucket.restaurants.has(categoryId);
      if (inR && inC) categoryIdPointsBoth += 1;
      else if (inR) categoryIdPointsRestaurantes += 1;
      else if (inC) categoryIdPointsRestaurants += 1;
      else categoryIdPointsNeither += 1;

      const refKey = `${parsed.restaurantId}|${categoryId}`;
      categoryRefCount.set(refKey, (categoryRefCount.get(refKey) ?? 0) + 1);

      if (!inR && !inC) {
        const prev = orphanCategoryIds.get(refKey);
        orphanCategoryIds.set(refKey, {
          restaurantId: parsed.restaurantId,
          categoryId,
          productCount: (prev?.productCount ?? 0) + 1,
        });
      }
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "collectionGroup products failed",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exit(1);
  }

  const orphanCategories: Array<{
    restaurantId: string;
    root: RootKind;
    categoryId: string;
    name: string;
  }> = [];

  for (const [rid, bucket] of byTenantRoot) {
    for (const [root, map] of [
      ["restaurantes", bucket.restaurantes],
      ["restaurants", bucket.restaurants],
    ] as const) {
      for (const [catId, row] of map) {
        const refKey = `${rid}|${catId}`;
        if ((categoryRefCount.get(refKey) ?? 0) === 0) {
          orphanCategories.push({
            restaurantId: rid,
            root,
            categoryId: catId,
            name: row.name,
          });
        }
      }
    }
  }

  const tenantBreakdown = [...tenantIds].sort().map((rid) => {
    const bucket = byTenantRoot.get(rid) ?? { restaurantes: new Map(), restaurants: new Map() };
    let productsWithCategoryId = 0;
    for (const [refKey, count] of categoryRefCount) {
      if (!refKey.startsWith(`${rid}|`)) continue;
      productsWithCategoryId += count;
    }
    // recount products for tenant from orphan map + refs — use per-tenant from scanned paths
    return {
      restaurantId: rid,
      restaurantesCategories: bucket.restaurantes.size,
      restaurantsCategories: bucket.restaurants.size,
      categoryIdsRestaurantes: [...bucket.restaurantes.keys()],
      categoryIdsRestaurants: [...bucket.restaurants.keys()],
      productsReferencingCategories: productsWithCategoryId,
    };
  });

  // Per-tenant product counts (second pass metadata from scan)
  const productsPerTenant = new Map<string, { total: number; withCategoryId: number }>();
  try {
    const prodCg = await db.collectionGroup("products").get();
    for (const doc of prodCg.docs) {
      const parsed = parseCentralProductPath(doc.ref.path);
      if (!parsed) continue;
      const cur = productsPerTenant.get(parsed.restaurantId) ?? { total: 0, withCategoryId: 0 };
      cur.total += 1;
      const data = doc.data() as Record<string, unknown>;
      const categoryId =
        typeof data.categoryId === "string" && data.categoryId.trim() ? data.categoryId.trim() : null;
      if (categoryId) cur.withCategoryId += 1;
      productsPerTenant.set(parsed.restaurantId, cur);
    }
  } catch {
    /* already scanned above */
  }

  const tenantBreakdownFinal = tenantBreakdown.map((row) => {
    const p = productsPerTenant.get(row.restaurantId);
    return {
      ...row,
      productsTotal: p?.total ?? 0,
      productsWithCategoryId: p?.withCategoryId ?? 0,
      productsWithoutCategoryId: (p?.total ?? 0) - (p?.withCategoryId ?? 0),
      orphanCategoriesRestaurantes: [...(byTenantRoot.get(row.restaurantId)?.restaurantes ?? new Map())]
        .filter(([catId]) => (categoryRefCount.get(`${row.restaurantId}|${catId}`) ?? 0) === 0)
        .map(([catId, r]) => ({ categoryId: catId, name: r.name })),
      orphanCategoriesRestaurants: [...(byTenantRoot.get(row.restaurantId)?.restaurants ?? new Map())]
        .filter(([catId]) => (categoryRefCount.get(`${row.restaurantId}|${catId}`) ?? 0) === 0)
        .map(([catId, r]) => ({ categoryId: catId, name: r.name })),
    };
  });

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantBreakdown: tenantBreakdownFinal,
    tenants: {
      totalUnion: tenantIds.size,
      soloRestaurantes: tenantsSoloRestaurantes,
      soloRestaurants: tenantsSoloRestaurants,
      ambos: tenantsAmbos,
      ninguno: tenantsNinguno,
    },
    categories: {
      totalRestaurantes,
      totalRestaurants,
      totalCombined: totalRestaurantes + totalRestaurants,
      tenantsWithRestaurantes: [...byTenantRoot.values()].filter((b) => b.restaurantes.size > 0).length,
      tenantsWithRestaurants: [...byTenantRoot.values()].filter((b) => b.restaurants.size > 0).length,
    },
    duplicates: {
      sameIdsCrossRootCount: sameIdsCrossRoot.length,
      sameIdsCrossRootSample: sameIdsCrossRoot.slice(0, 20),
      sameNameDistIdCount: sameNameDistId.length,
      sameNameDistIdSample: sameNameDistId.slice(0, 20),
    },
    orphanCategories: {
      count: orphanCategories.length,
      byRoot: {
        restaurantes: orphanCategories.filter((o) => o.root === "restaurantes").length,
        restaurants: orphanCategories.filter((o) => o.root === "restaurants").length,
      },
      sample: orphanCategories.slice(0, 30),
    },
    productsCategoryId: {
      productsScannedCentral: productsScanned,
      withCategoryId: productsWithCategoryId,
      withoutCategoryId: productsScanned - productsWithCategoryId,
      pointsRestaurantes: categoryIdPointsRestaurantes,
      pointsRestaurants: categoryIdPointsRestaurants,
      pointsBoth: categoryIdPointsBoth,
      pointsNeither: categoryIdPointsNeither,
      orphanCategoryIdKeys: orphanCategoryIds.size,
      orphanCategoryIdSample: [...orphanCategoryIds.values()]
        .sort((a, b) => b.productCount - a.productCount)
        .slice(0, 30),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
