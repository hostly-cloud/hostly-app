"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import {
  centralProductVisibleOnMenu,
  centralProductsToPlatos,
  isStockIngredientProduct,
  platoCartaToOperationalProduct,
  publicationOnMenu,
} from "@/lib/carta/operational-catalog-mappers";
import { listenCentralProducts, type ProductDocument } from "@/lib/firestore/products";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { useAuth } from "@/components/auth/auth-context";
import { loadPlatos, PLATOS_CHANGED_EVENT } from "@/lib/carta/legacy-platos-storage";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import type { Product } from "@/types/product";

export type OperationalCatalogSource =
  | "central"
  | "legacy_local"
  | "legacy_fallback";

export type CentralCatalogScope = "tpv_menu" | "management";

/** `management`: catálogo de carta (excluye ingredientes de stock `type === "inventory"`). */
export type UseCentralProductsForCartaOptions = {
  scope?: CentralCatalogScope;
  /**
   * No suscribir a `restaurants/{id}/products` hasta auth + perfil + restaurantId del perfil.
   * Con este contrato activo, Firestore es autoritativo incluso cuando el snapshot está vacío
   * o el listener falla: nunca se reactiva un catálogo localStorage de otro contexto.
   */
  requireAuthenticatedTenant?: boolean;
};

export type UseCentralProductsForCartaResult = {
  products: Product[];
  platos: PlatoCarta[];
  loading: boolean;
  source: OperationalCatalogSource | null;
  usingLegacyFallback: boolean;
  catalogDevWarning: string | null;
  /** Snapshot central indexado por id (misma escucha que `products`). */
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
  /**
   * Snapshot completo del listener (incluye `type === "inventory"`).
   * Usar solo para resolución de costes/recetas, no para listados de carta.
   */
  allProductDocumentsById: ReadonlyMap<string, ProductDocument>;
  /** Perfil resuelto pero sin `restaurantId` (solo con `requireAuthenticatedTenant`). */
  tenantUnavailable: boolean;
};

function loadLegacyPlatos(restaurantId: string, scope: CentralCatalogScope): PlatoCarta[] {
  const list = loadPlatos(restaurantId);
  if (scope === "management") return list;
  return list.filter(publicationOnMenu);
}

function filterCentralForScope(
  docs: ProductDocument[],
  scope: CentralCatalogScope,
): ProductDocument[] {
  if (scope === "management") {
    return docs.filter((doc) => !isStockIngredientProduct(doc));
  }
  return docs.filter(centralProductVisibleOnMenu);
}

function mapToResult(
  platos: PlatoCarta[],
  source: OperationalCatalogSource,
  scope: CentralCatalogScope,
): Pick<
  UseCentralProductsForCartaResult,
  "products" | "platos" | "source" | "usingLegacyFallback" | "catalogDevWarning"
> {
  const usingLegacyFallback =
    source === "legacy_local" || source === "legacy_fallback";
  const catalogDevWarning = usingLegacyFallback
    ? source === "legacy_fallback"
      ? "[Hostly] Catálogo operativo: fallback localStorage (Firestore no disponible)."
      : "[Hostly] Catálogo operativo: fallback localStorage (sin productos en restaurants/{id}/products)."
    : null;

  if (
    usingLegacyFallback &&
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    catalogDevWarning
  ) {
    console.warn(catalogDevWarning, { scope, count: platos.length });
  }

  return {
    platos,
    products: platos.map(platoCartaToOperationalProduct),
    source,
    usingLegacyFallback,
    catalogDevWarning,
  };
}

/**
 * Firestore `restaurants/{restaurantId}/products` es la fuente primaria.
 * El fallback local solo se conserva para consumidores legacy que no exigen tenant autenticado.
 * Para `requireAuthenticatedTenant`, un catálogo central vacío sigue siendo un catálogo central
 * válido y los fallos de disponibilidad se cierran sin reutilizar localStorage.
 */
export function useCentralProductsForCarta(
  restaurantId: string | null | undefined,
  options?: UseCentralProductsForCartaOptions,
): UseCentralProductsForCartaResult {
  const scope = options?.scope ?? "tpv_menu";
  const requireAuthenticatedTenant = options?.requireAuthenticatedTenant === true;
  const { ready: authReady, profileReady } = useAuth();
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  const awaitingProfileTenant =
    requireAuthenticatedTenant && (!authReady || !profileReady);
  const tenantUnavailable =
    requireAuthenticatedTenant && authReady && profileReady && rid.length === 0;

  const [loading, setLoading] = useState(true);
  const [platos, setPlatos] = useState<PlatoCarta[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<OperationalCatalogSource | null>(null);
  const [usingLegacyFallback, setUsingLegacyFallback] = useState(false);
  const [catalogDevWarning, setCatalogDevWarning] = useState<string | null>(null);
  const [centralProductDocuments, setCentralProductDocuments] = useState<
    ProductDocument[]
  >([]);
  const [centralProductDocumentsAll, setCentralProductDocumentsAll] = useState<
    ProductDocument[]
  >([]);

  const categoryNameByIdRef = useRef<Map<string, string>>(new Map());
  const centralDocsRef = useRef<ProductDocument[]>([]);
  const hasCentralSnapshotRef = useRef(false);
  const listenFailedRef = useRef(false);
  const subscribedRidRef = useRef<string | null>(null);

  const applyCatalog = useCallback(
    (
      nextPlatos: PlatoCarta[],
      nextSource: OperationalCatalogSource,
    ) => {
      const mapped = mapToResult(nextPlatos, nextSource, scope);
      setPlatos(mapped.platos);
      setProducts(mapped.products);
      setSource(mapped.source);
      setUsingLegacyFallback(mapped.usingLegacyFallback);
      setCatalogDevWarning(mapped.catalogDevWarning);
      setLoading(false);
    },
    [scope],
  );

  const applyCentralDocs = useCallback(
    (docs: ProductDocument[]) => {
      if (!rid) {
        if (requireAuthenticatedTenant) {
          setCentralProductDocuments([]);
          setCentralProductDocumentsAll([]);
          setPlatos([]);
          setProducts([]);
          setSource(null);
          setUsingLegacyFallback(false);
          setCatalogDevWarning(null);
          setLoading(false);
          return;
        }
        applyCatalog([], "legacy_local");
        return;
      }

      const filtered = filterCentralForScope(docs, scope);
      setCentralProductDocuments(filtered);
      setCentralProductDocumentsAll(docs);

      if (docs.length > 0 || requireAuthenticatedTenant) {
        const platosList = centralProductsToPlatos(
          filtered,
          rid,
          categoryNameByIdRef.current,
        );
        applyCatalog(platosList, "central");
        return;
      }

      applyCatalog(loadLegacyPlatos(rid, scope), "legacy_local");
    },
    [applyCatalog, requireAuthenticatedTenant, rid, scope],
  );

  const failClosedAuthenticatedCatalog = useCallback(() => {
    centralDocsRef.current = [];
    hasCentralSnapshotRef.current = false;
    setCentralProductDocuments([]);
    setCentralProductDocumentsAll([]);
    applyCatalog([], "central");
  }, [applyCatalog]);

  useEffect(() => {
    if (!rid) {
      if (awaitingProfileTenant) {
        setLoading(true);
        return;
      }
      setLoading(false);
      setPlatos([]);
      setProducts([]);
      setSource(null);
      setUsingLegacyFallback(false);
      setCatalogDevWarning(null);
      setCentralProductDocuments([]);
      setCentralProductDocumentsAll([]);
      return;
    }

    let cancelled = false;
    void fetchCartaCategorias(rid).then((cats) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const c of cats) {
        if (c.id && c.name?.trim()) map.set(c.id, c.name.trim());
      }
      categoryNameByIdRef.current = map;
      if (hasCentralSnapshotRef.current) {
        applyCentralDocs(centralDocsRef.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applyCentralDocs, awaitingProfileTenant, rid]);

  useEffect(() => {
    if (awaitingProfileTenant) {
      setLoading(true);
      return;
    }
    if (!rid) {
      setLoading(false);
      return;
    }
    if (!authReady) return;
    if (!isAuthReady() || !isFirebaseConfigured) {
      if (requireAuthenticatedTenant) {
        failClosedAuthenticatedCatalog();
        return;
      }
      applyCatalog(loadLegacyPlatos(rid, scope), "legacy_local");
      return;
    }

    const ridChanged = subscribedRidRef.current !== rid;
    if (ridChanged) {
      subscribedRidRef.current = rid;
      listenFailedRef.current = false;
      hasCentralSnapshotRef.current = false;
      centralDocsRef.current = [];
      setLoading(true);
    }

    const unsub = listenCentralProducts(
      rid,
      (docs) => {
        listenFailedRef.current = false;
        hasCentralSnapshotRef.current = true;
        centralDocsRef.current = docs;
        applyCentralDocs(docs);
      },
      () => {
        if (!rid) return;
        listenFailedRef.current = true;
        if (requireAuthenticatedTenant) {
          failClosedAuthenticatedCatalog();
          return;
        }
        applyCatalog(loadLegacyPlatos(rid, scope), "legacy_fallback");
      },
    );

    return () => {
      unsub();
    };
  }, [
    applyCatalog,
    applyCentralDocs,
    authReady,
    awaitingProfileTenant,
    failClosedAuthenticatedCatalog,
    requireAuthenticatedTenant,
    rid,
    scope,
  ]);

  useEffect(() => {
    if (!rid || !hasCentralSnapshotRef.current || listenFailedRef.current) return;
    applyCentralDocs(centralDocsRef.current);
  }, [applyCentralDocs, rid, scope]);

  useEffect(() => {
    if (
      requireAuthenticatedTenant ||
      !rid ||
      source === "central" ||
      source === null
    ) {
      return;
    }
    if (typeof window === "undefined") return;

    const onLegacyChange = () => {
      applyCatalog(loadLegacyPlatos(rid, scope), source);
    };
    window.addEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
  }, [applyCatalog, requireAuthenticatedTenant, rid, scope, source]);

  return useMemo(() => {
    const productDocumentsById = new Map<string, ProductDocument>();
    for (const doc of centralProductDocuments) {
      productDocumentsById.set(doc.id, doc);
    }
    const allProductDocumentsById = new Map<string, ProductDocument>();
    for (const doc of centralProductDocumentsAll) {
      allProductDocumentsById.set(doc.id, doc);
    }
    return {
      products,
      platos,
      loading,
      source,
      usingLegacyFallback,
      catalogDevWarning,
      productDocumentsById,
      allProductDocumentsById,
      tenantUnavailable,
    };
  }, [
    catalogDevWarning,
    centralProductDocuments,
    centralProductDocumentsAll,
    loading,
    platos,
    products,
    source,
    tenantUnavailable,
    usingLegacyFallback,
  ]);
}