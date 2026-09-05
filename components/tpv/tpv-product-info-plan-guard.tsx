"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { readProductGastronomy } from "@/lib/carta/product-gastronomy";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import { fetchHostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access-api";
import {
  resolveTpvProductInfoAccess,
  type TpvProductInfoAccess,
} from "@/lib/tpv/product-info-plan-access";
import type {
  SommelierApiResponse,
  SommelierPairing,
  SommelierSnapshot,
} from "@/lib/sommelier/sommelier-types";
import type {
  Product,
  ProductAllergen,
  ProductWineBody,
  ProductWineStyle,
  ProductWineSweetness,
} from "@/types/product";

const CLOSED_ACCESS: TpvProductInfoAccess = {
  canOpenGastronomy: false,
  canSeeAllergens: false,
  canSeeWineProfile: false,
  canSeeAiPairings: false,
};

const ALLERGEN_LABELS: Record<ProductAllergen, string> = {
  gluten: "Gluten",
  crustaceans: "Crustáceos",
  eggs: "Huevos",
  fish: "Pescado",
  peanuts: "Cacahuetes",
  soybeans: "Soja",
  milk: "Leche / lácteos",
  nuts: "Frutos secos",
  celery: "Apio",
  mustard: "Mostaza",
  sesame: "Sésamo",
  sulphites: "Sulfitos",
  lupin: "Altramuces",
  molluscs: "Moluscos",
};

const WINE_STYLE_LABELS: Record<ProductWineStyle, string> = {
  red: "Tinto",
  white: "Blanco",
  rose: "Rosado",
  sparkling: "Espumoso",
  sweet: "Dulce",
  fortified: "Generoso",
  unknown: "Estilo por confirmar",
};

const WINE_BODY_LABELS: Record<ProductWineBody, string> = {
  light: "Ligero",
  medium: "Medio",
  full: "Con cuerpo",
  unknown: "Cuerpo por confirmar",
};

const WINE_SWEETNESS_LABELS: Record<ProductWineSweetness, string> = {
  dry: "Seco",
  off_dry: "Semiseco",
  sweet: "Dulce",
  unknown: "Dulzor por confirmar",
};

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("es");
}

function productFromCard(
  button: HTMLButtonElement,
  products: readonly Product[],
): Product | null {
  const nameNode = button.querySelector<HTMLElement>(".carta-product-name");
  const rawName = nameNode?.getAttribute("title")?.trim() || nameNode?.textContent?.trim() || "";
  if (!rawName) return null;
  const key = normalizedName(rawName);
  const matches = products.filter((product) => normalizedName(product.nombre) === key);
  // Un nombre duplicado no se resuelve por heurística: sin id inequívoco no abrimos la ficha.
  return matches.length === 1 ? matches[0]! : null;
}

function productPairings(
  productId: string,
  snapshot: SommelierSnapshot | null,
): { direction: "dish-to-wine" | "wine-to-dish" | null; items: SommelierPairing[] } {
  if (!snapshot) return { direction: null, items: [] };
  const isWine = snapshot.wines.some((wine) => wine.id === productId);
  const isDish = snapshot.dishes.some((dish) => dish.id === productId);
  if (isWine) {
    return {
      direction: "wine-to-dish",
      items: snapshot.pairings
        .filter((pairing) => pairing.wineProductId === productId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    };
  }
  if (isDish) {
    return {
      direction: "dish-to-wine",
      items: snapshot.pairings
        .filter((pairing) => pairing.dishProductId === productId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    };
  }
  return { direction: null, items: [] };
}

/**
 * Hace de la pulsación larga una capacidad comercial centralizada:
 * Básico = clic normal solamente; Pro = ficha gastronómica; Ultra = Pro + Sommelier.
 * Si no podemos resolver plan o producto con certeza, falla cerrado.
 */
export function TpvProductInfoPlanGuard() {
  const { restaurantId, ready, profileReady } = useAuth();
  const rid = ready && profileReady ? restaurantId?.trim() || null : null;
  const catalog = useCentralProductsForCarta(rid, {
    scope: "tpv_menu",
    requireAuthenticatedTenant: true,
  });
  const productsRef = useRef<readonly Product[]>([]);

  const [access, setAccess] = useState<TpvProductInfoAccess>(CLOSED_ACCESS);
  const accessRef = useRef<TpvProductInfoAccess>(CLOSED_ACCESS);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sommelierSnapshot, setSommelierSnapshot] = useState<SommelierSnapshot | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdButtonRef = useRef<HTMLButtonElement | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    productsRef.current = catalog.products;
  }, [catalog.products]);

  useEffect(() => {
    accessRef.current = access;
  }, [access]);

  useEffect(() => {
    let cancelled = false;
    setAccess(CLOSED_ACCESS);
    setSommelierSnapshot(null);
    if (!rid) return () => {
      cancelled = true;
    };

    void fetchHostlySubscriptionAccess()
      .then(async (subscription) => {
        if (cancelled) return;
        const nextAccess = resolveTpvProductInfoAccess(subscription.effectivePlan);
        setAccess(nextAccess);
        if (!nextAccess.canSeeAiPairings) return;
        const response = await authenticatedApiFetch("/api/ai/sommelier", {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as SommelierApiResponse | null;
        if (cancelled || !response.ok || !body || body.ok !== true || !body.entitled) return;
        setSommelierSnapshot(body.snapshot);
      })
      .catch(() => {
        if (!cancelled) {
          setAccess(CLOSED_ACCESS);
          setSommelierSnapshot(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rid]);

  useEffect(() => {
    const clearHold = () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      holdButtonRef.current = null;
      holdStartRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(".carta-product-card");
      if (!button) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      // Evita que el megacomponente TPV ejecute su long-press/repeat-add legacy.
      event.stopPropagation();
      clearHold();
      if (!accessRef.current.canOpenGastronomy) return;

      const product = productFromCard(button, productsRef.current);
      if (!product) return;
      holdButtonRef.current = button;
      holdStartRef.current = { x: event.clientX, y: event.clientY };
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        suppressNextClickRef.current = button;
        setSelectedProduct(product);
      }, 900);
    };

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".carta-product-card")) return;
      if (event.button !== 0) return;
      // PointerDown ya gestiona el hold; bloqueamos únicamente el repeat-add de mouse legacy.
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const start = holdStartRef.current;
      if (!start || holdTimerRef.current == null) return;
      if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
        clearHold();
      }
    };

    const onPointerEnd = () => clearHold();

    const onClick = (event: MouseEvent) => {
      const blockedButton = suppressNextClickRef.current;
      if (!blockedButton) return;
      const target = event.target;
      if (!(target instanceof Node) || !blockedButton.contains(target)) return;
      suppressNextClickRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    document.addEventListener("click", onClick, true);
    return () => {
      clearHold();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const details = useMemo(
    () => (selectedProduct ? readProductGastronomy(selectedProduct) : null),
    [selectedProduct],
  );
  const pairings = useMemo(
    () => productPairings(selectedProduct?.id ?? "", sommelierSnapshot),
    [selectedProduct?.id, sommelierSnapshot],
  );

  if (!selectedProduct || !details || !access.canOpenGastronomy) return null;
  const wine = details.gastronomy.wine;
  const allergens = details.gastronomy.allergens ?? [];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3"
      role="presentation"
      onClick={() => setSelectedProduct(null)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hostly-tpv-product-info-plan-title"
        className="relative max-h-[85vh] w-full max-w-[380px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-2 top-2 rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-slate-100"
          aria-label="Cerrar"
          onClick={() => setSelectedProduct(null)}
        >
          ×
        </button>
        <h2 id="hostly-tpv-product-info-plan-title" className="pr-8 text-lg font-extrabold">
          {selectedProduct.nombre}
        </h2>

        {access.canSeeAllergens ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Alérgenos</h3>
            {!details.hasAllergenInformation ? (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                Información de alérgenos no registrada. No asumir ausencia de alérgenos.
              </p>
            ) : allergens.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Sin alérgenos marcados en la ficha revisada.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allergens.map((allergen) => (
                  <span key={allergen} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
                    {ALLERGEN_LABELS[allergen]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {access.canSeeWineProfile && wine ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Perfil del vino</h3>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold text-slate-700">
              {wine.style ? <span className="rounded-full bg-slate-100 px-2 py-1">{WINE_STYLE_LABELS[wine.style]}</span> : null}
              {wine.sweetness ? <span className="rounded-full bg-slate-100 px-2 py-1">{WINE_SWEETNESS_LABELS[wine.sweetness]}</span> : null}
              {wine.body ? <span className="rounded-full bg-slate-100 px-2 py-1">{WINE_BODY_LABELS[wine.body]}</span> : null}
              {wine.grapes?.map((grape) => <span key={grape} className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">{grape}</span>)}
            </div>
            {wine.tastingNotes?.length ? (
              <p className="mt-2 text-sm text-slate-700">{wine.tastingNotes.join(" · ")}</p>
            ) : null}
            {[wine.denomination, wine.region, wine.country].filter(Boolean).length ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {[wine.denomination, wine.region, wine.country].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {access.canSeeAiPairings ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              {pairings.direction === "wine-to-dish" ? "Platos recomendados" : "Vinos recomendados"}
            </h3>
            {pairings.items.length ? (
              <div className="mt-2 space-y-2">
                {pairings.items.map((pairing) => (
                  <article key={pairing.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <strong className="text-sm text-slate-900">
                        {pairings.direction === "wine-to-dish" ? pairing.dishName : pairing.wineName}
                      </strong>
                      <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-extrabold text-sky-800">
                        {pairing.score}%
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">{pairing.reason}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Aún no hay maridajes generados para este producto.
              </p>
            )}
            <p className="mt-2 text-[11px] font-semibold text-slate-400">
              Sommelier IA · recomendaciones limitadas a productos reales de este restaurante.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
