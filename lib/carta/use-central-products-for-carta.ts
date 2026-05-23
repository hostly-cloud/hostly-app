"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import {
  centralProductVisibleOnMenu,
  centralProductsToPlatos,
  platoCartaToOperationalProduct,
  publicationOnMenu,
} from "@/lib/carta/operational-catalog-mappers";
import { listenCentralProducts, type ProductDocument } from "@/lib/firestore/products";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { useAuth } from "@/components/auth/auth-context";
import { loadPlatos, PLATOS_CHANGED_EVENT, type PlatoCarta } from "@/lib/platos-local";
import type { Product } from "@/types/product";

export type OperationalCatalogSource =
  | "central"
  | "legacy_local"
  | "legacy_fallback";

export type CentralCatalogScope = "tpv_menu" | "management";

export type UseCentralProductsForCartaResult = {
  products: Product[];
  platos: PlatoCarta[];
  loading: boolean;
  source: OperationalCatalogSource | null;
  usingLegacyFallback: boolean;
  catalogDevWarning: string | null;
  /** Snapshot central indexado por id (misma escucha que `products`). */
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
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
  if (scope === "management") return docs;
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
 * Fase 9A: escucha `restaurants/{restaurantId}/products` como fuente primaria;
 * localStorage (`hostly.platos.v1`) solo si el central está vacío o falla el listener.
 */
export function useCentralProductsForCarta(
  restaurantId: string | null | undefined,
  options?: { scope?: CentralCatalogScope },
): UseCentralProductsForCartaResult {
  const scope = options?.scope ?? "tpv_menu";
  const { ready: authReady } = useAuth();
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";

  const [loading, setLoading] = useState(true);
  const [platos, setPlatos] = useState<PlatoCarta[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<OperationalCatalogSource | null>(null);
  const [usingLegacyFallback, setUsingLegacyFallback] = useState(false);
  const [catalogDevWarning, setCatalogDevWarning] = useState<string | null>(null);
  const [centralProductDocuments, setCentralProductDocuments] = useState<
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
        applyCatalog([], "legacy_local");
        return;
      }
      if (docs.length > 0) {
        const filtered = filterCentralForScope(docs, scope);
        setCentralProductDocuments(filtered);
        const platosList = centralProductsToPlatos(
          filtered,
          rid,
          categoryNameByIdRef.current,
        );
        applyCatalog(platosList, "central");
        return;
      }
      setCentralProductDocuments([]);
      applyCatalog(loadLegacyPlatos(rid, scope), "legacy_local");
    },
    [applyCatalog, rid, scope],
  );

  useEffect(() => {
    if (!rid) {
      setLoading(false);
      setPlatos([]);
      setProducts([]);
      setSource(null);
      setUsingLegacyFallback(false);
      setCatalogDevWarning(null);
      setCentralProductDocuments([]);
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
  }, [applyCentralDocs, rid]);

  useEffect(() => {
    if (!rid) {
      setLoading(false);
      return;
    }
    if (!authReady) return;
    if (!isAuthReady() || !isFirebaseConfigured) {
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
        applyCatalog(loadLegacyPlatos(rid, scope), "legacy_fallback");
      },
    );

    return () => {
      unsub();
    };
  }, [applyCatalog, applyCentralDocs, authReady, rid]);

  useEffect(() => {
    if (!rid || !hasCentralSnapshotRef.current || listenFailedRef.current) return;
    applyCentralDocs(centralDocsRef.current);
  }, [applyCentralDocs, rid, scope]);

  useEffect(() => {
    if (!rid || source === "central" || source === null) return;
    if (typeof window === "undefined") return;

    const onLegacyChange = () => {
      applyCatalog(loadLegacyPlatos(rid, scope), source);
    };
    window.addEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
  }, [applyCatalog, rid, scope, source]);

  return useMemo(() => {
    const productDocumentsById = new Map<string, ProductDocument>();
    for (const doc of centralProductDocuments) {
      productDocumentsById.set(doc.id, doc);
    }
    return {
      products,
      platos,
      loading,
      source,
      usingLegacyFallback,
      catalogDevWarning,
      productDocumentsById,
    };
  }, [
    catalogDevWarning,
    centralProductDocuments,
    loading,
    platos,
    products,
    source,
    usingLegacyFallback,
  ]);
}
