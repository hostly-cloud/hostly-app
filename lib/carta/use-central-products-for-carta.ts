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
import {
  listenProductGastronomyByRestaurant,
  type ProductGastronomySnapshot,
} from "@/lib/firestore/product-gastronomy";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { useAuth } from "@/components/auth/auth-context";
import { loadPlatos, PLATOS_CHANGED_EVENT } from "@/lib/carta/legacy-platos-storage";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import type { Product } from "@/types/product";

export type OperationalCatalogSource = "central" | "legacy_local" | "legacy_fallback";
export type CentralCatalogScope = "tpv_menu" | "management";
export type UseCentralProductsForCartaOptions = { scope?: CentralCatalogScope; requireAuthenticatedTenant?: boolean };
export type UseCentralProductsForCartaResult = {
  products: Product[]; platos: PlatoCarta[]; loading: boolean; source: OperationalCatalogSource | null;
  usingLegacyFallback: boolean; catalogDevWarning: string | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
  allProductDocumentsById: ReadonlyMap<string, ProductDocument>;
  tenantUnavailable: boolean;
};

function loadLegacyPlatos(restaurantId: string, scope: CentralCatalogScope): PlatoCarta[] {
  const list = loadPlatos(restaurantId);
  return scope === "management" ? list : list.filter(publicationOnMenu);
}
function filterCentralForScope(docs: ProductDocument[], scope: CentralCatalogScope): ProductDocument[] {
  return scope === "management" ? docs.filter((doc) => !isStockIngredientProduct(doc)) : docs.filter(centralProductVisibleOnMenu);
}
function mapToResult(platos: PlatoCarta[], source: OperationalCatalogSource, scope: CentralCatalogScope): Pick<UseCentralProductsForCartaResult, "products" | "platos" | "source" | "usingLegacyFallback" | "catalogDevWarning"> {
  const usingLegacyFallback = source === "legacy_local" || source === "legacy_fallback";
  const catalogDevWarning = usingLegacyFallback ? source === "legacy_fallback" ? "[Hostly] Catálogo operativo: fallback localStorage (Firestore no disponible)." : "[Hostly] Catálogo operativo: fallback localStorage (sin productos en restaurants/{id}/products)." : null;
  if (usingLegacyFallback && typeof process !== "undefined" && process.env.NODE_ENV === "development" && catalogDevWarning) console.warn(catalogDevWarning, { scope, count: platos.length });
  return { platos, products: platos.map(platoCartaToOperationalProduct), source, usingLegacyFallback, catalogDevWarning };
}
function enrichOperationalProductWithGastronomy(product: Product, snapshot: ProductGastronomySnapshot | undefined): Product {
  if (!snapshot || snapshot.source === "none") return product;
  const g = snapshot.gastronomy;
  const wine = g.wine;
  const enriched: Product & Record<string, unknown> = { ...product, gastronomy: g };
  if (g.ingredients) enriched.ingredients = g.ingredients;
  if (snapshot.hasAllergenInformation) enriched.allergens = g.allergens ?? [];
  if (g.caloriesKcal != null) enriched.caloriesKcal = g.caloriesKcal;
  if (g.description) enriched.description = g.description;
  if (wine) {
    if (wine.style) enriched.wineType = wine.style;
    if (wine.grapes?.length) { enriched.grape = wine.grapes.join(", "); enriched.grapes = wine.grapes; }
    if (wine.region) enriched.region = wine.region;
    if (wine.denomination) enriched.denomination = wine.denomination;
    if (wine.country) enriched.country = wine.country;
    if (wine.vintage != null) enriched.vintage = wine.vintage;
    if (wine.abv != null) enriched.abv = wine.abv;
    if (wine.tastingNotes?.length) enriched.tastingNotes = wine.tastingNotes.join(", ");
  }
  return enriched;
}

export function useCentralProductsForCarta(restaurantId: string | null | undefined, options?: UseCentralProductsForCartaOptions): UseCentralProductsForCartaResult {
  const scope = options?.scope ?? "tpv_menu";
  const requireAuthenticatedTenant = options?.requireAuthenticatedTenant === true;
  const { ready: authReady, profileReady } = useAuth();
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  const awaitingProfileTenant = requireAuthenticatedTenant && (!authReady || !profileReady);
  const tenantUnavailable = requireAuthenticatedTenant && authReady && profileReady && rid.length === 0;
  const [platos, setPlatos] = useState<PlatoCarta[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [gastronomyById, setGastronomyById] = useState<ReadonlyMap<string, ProductGastronomySnapshot>>(new Map());
  const [source, setSource] = useState<OperationalCatalogSource | null>(null);
  const [usingLegacyFallback, setUsingLegacyFallback] = useState(false);
  const [catalogDevWarning, setCatalogDevWarning] = useState<string | null>(null);
  const [centralProductDocuments, setCentralProductDocuments] = useState<ProductDocument[]>([]);
  const [centralProductDocumentsAll, setCentralProductDocumentsAll] = useState<ProductDocument[]>([]);
  const catalogKey = rid ? `${rid}:${scope}:${requireAuthenticatedTenant ? "authenticated" : "legacy"}` : "";
  const [resolvedCatalogKey, setResolvedCatalogKey] = useState<string | null>(null);
  const catalogMatches = Boolean(catalogKey && resolvedCatalogKey === catalogKey);
  const loading = awaitingProfileTenant || Boolean(rid && !catalogMatches);
  const categoryNameByIdRef = useRef<Map<string, string>>(new Map());
  const centralDocsRef = useRef<ProductDocument[]>([]);
  const hasCentralSnapshotRef = useRef(false);
  const listenFailedRef = useRef(false);
  const subscribedRidRef = useRef<string | null>(null);

  const applyCatalog = useCallback((nextPlatos: PlatoCarta[], nextSource: OperationalCatalogSource) => {
    const mapped = mapToResult(nextPlatos, nextSource, scope);
    setPlatos(mapped.platos); setProducts(mapped.products); setSource(mapped.source);
    setUsingLegacyFallback(mapped.usingLegacyFallback); setCatalogDevWarning(mapped.catalogDevWarning); setResolvedCatalogKey(catalogKey);
  }, [catalogKey, scope]);
  const applyCentralDocs = useCallback((docs: ProductDocument[]) => {
    if (!rid) return;
    const filtered = filterCentralForScope(docs, scope);
    setCentralProductDocuments(filtered); setCentralProductDocumentsAll(docs);
    if (docs.length > 0 || requireAuthenticatedTenant) {
      applyCatalog(centralProductsToPlatos(filtered, rid, categoryNameByIdRef.current), "central"); return;
    }
    applyCatalog(loadLegacyPlatos(rid, scope), "legacy_local");
  }, [applyCatalog, requireAuthenticatedTenant, rid, scope]);
  const failClosedAuthenticatedCatalog = useCallback(() => {
    centralDocsRef.current = []; hasCentralSnapshotRef.current = false;
    setCentralProductDocuments([]); setCentralProductDocumentsAll([]); setGastronomyById(new Map()); applyCatalog([], "central");
  }, [applyCatalog]);

  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    void fetchCartaCategorias(rid).then((cats) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const c of cats) if (c.id && c.name?.trim()) map.set(c.id, c.name.trim());
      categoryNameByIdRef.current = map;
      if (hasCentralSnapshotRef.current) applyCentralDocs(centralDocsRef.current);
    });
    return () => { cancelled = true; };
  }, [applyCentralDocs, rid]);

  useEffect(() => {
    if (awaitingProfileTenant || !rid || !authReady || !isAuthReady() || !isFirebaseConfigured) {
      const resetTask = window.setTimeout(() => setGastronomyById(new Map()), 0);
      return () => window.clearTimeout(resetTask);
    }
    return listenProductGastronomyByRestaurant(rid, setGastronomyById, () => setGastronomyById(new Map()));
  }, [authReady, awaitingProfileTenant, rid]);

  useEffect(() => {
    if (awaitingProfileTenant || !rid || !authReady) return;
    if (!isAuthReady() || !isFirebaseConfigured) {
      const fallbackTask = window.setTimeout(() => {
        if (requireAuthenticatedTenant) { failClosedAuthenticatedCatalog(); return; }
        applyCatalog(loadLegacyPlatos(rid, scope), "legacy_local");
      }, 0);
      return () => window.clearTimeout(fallbackTask);
    }
    const ridChanged = subscribedRidRef.current !== rid;
    if (ridChanged) { subscribedRidRef.current = rid; listenFailedRef.current = false; hasCentralSnapshotRef.current = false; centralDocsRef.current = []; }
    const unsub = listenCentralProducts(rid, (docs) => {
      listenFailedRef.current = false; hasCentralSnapshotRef.current = true; centralDocsRef.current = docs; applyCentralDocs(docs);
    }, () => {
      if (!rid) return;
      listenFailedRef.current = true;
      if (requireAuthenticatedTenant) { failClosedAuthenticatedCatalog(); return; }
      applyCatalog(loadLegacyPlatos(rid, scope), "legacy_fallback");
    });
    return () => { unsub(); };
  }, [applyCatalog, applyCentralDocs, authReady, awaitingProfileTenant, failClosedAuthenticatedCatalog, requireAuthenticatedTenant, rid, scope]);

  useEffect(() => {
    if (!rid || !hasCentralSnapshotRef.current || listenFailedRef.current) return;
    const refreshTask = window.setTimeout(() => applyCentralDocs(centralDocsRef.current), 0);
    return () => window.clearTimeout(refreshTask);
  }, [applyCentralDocs, rid, scope]);

  useEffect(() => {
    if (requireAuthenticatedTenant || !rid || source === "central" || source === null || typeof window === "undefined") return;
    const onLegacyChange = () => applyCatalog(loadLegacyPlatos(rid, scope), source);
    window.addEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onLegacyChange);
  }, [applyCatalog, requireAuthenticatedTenant, rid, scope, source]);

  return useMemo(() => {
    const productDocumentsById = new Map<string, ProductDocument>();
    for (const doc of catalogMatches ? centralProductDocuments : []) productDocumentsById.set(doc.id, doc);
    const allProductDocumentsById = new Map<string, ProductDocument>();
    for (const doc of catalogMatches ? centralProductDocumentsAll : []) allProductDocumentsById.set(doc.id, doc);
    const visibleProducts = catalogMatches ? products.map((product) => enrichOperationalProductWithGastronomy(product, gastronomyById.get(product.id))) : [];
    return { products: visibleProducts, platos: catalogMatches ? platos : [], loading, source: catalogMatches ? source : null, usingLegacyFallback: catalogMatches ? usingLegacyFallback : false, catalogDevWarning: catalogMatches ? catalogDevWarning : null, productDocumentsById, allProductDocumentsById, tenantUnavailable };
  }, [catalogDevWarning, catalogMatches, centralProductDocuments, centralProductDocumentsAll, gastronomyById, loading, platos, products, source, tenantUnavailable, usingLegacyFallback]);
}
