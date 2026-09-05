"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { HostlyButton } from "@/components/ui/hostly";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import {
  PRODUCT_ALLERGENS,
  readProductGastronomy,
} from "@/lib/carta/product-gastronomy";
import { updateProductGastronomy } from "@/lib/firestore/product-gastronomy";
import type {
  ProductAllergen,
  ProductGastronomy,
  ProductWineBody,
  ProductWineStyle,
  ProductWineSweetness,
} from "@/types/product";

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

function splitList(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.split(/[,;\n]/)) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function optionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function ProductGastronomyManagementPanel() {
  const { restaurantId, ready, profileReady } = useAuth();
  const rid = ready && profileReady ? restaurantId?.trim() || null : null;
  const catalog = useCentralProductsForCarta(rid, {
    scope: "management",
    requireAuthenticatedTenant: true,
  });
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [allergensReviewed, setAllergensReviewed] = useState(false);
  const [allergens, setAllergens] = useState<ProductAllergen[]>([]);
  const [calories, setCalories] = useState("");
  const [isWine, setIsWine] = useState(false);
  const [wineStyle, setWineStyle] = useState<ProductWineStyle>("unknown");
  const [wineBody, setWineBody] = useState<ProductWineBody>("unknown");
  const [wineSweetness, setWineSweetness] = useState<ProductWineSweetness>("unknown");
  const [grapes, setGrapes] = useState("");
  const [region, setRegion] = useState("");
  const [denomination, setDenomination] = useState("");
  const [country, setCountry] = useState("");
  const [vintage, setVintage] = useState("");
  const [abv, setAbv] = useState("");
  const [tastingNotes, setTastingNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const products = useMemo(
    () => [...catalog.products].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [catalog.products],
  );
  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  useEffect(() => {
    if (!open || productId || products.length === 0) return;
    setProductId(products[0]!.id);
  }, [open, productId, products]);

  useEffect(() => {
    if (!selectedProduct) return;
    const parsed = readProductGastronomy(selectedProduct);
    const g = parsed.gastronomy;
    const wine = g.wine;
    setIngredients((g.ingredients ?? []).join("\n"));
    setAllergensReviewed(parsed.hasAllergenInformation);
    setAllergens(g.allergens ?? []);
    setCalories(g.caloriesKcal != null ? String(g.caloriesKcal) : "");
    setIsWine(Boolean(wine));
    setWineStyle(wine?.style ?? "unknown");
    setWineBody(wine?.body ?? "unknown");
    setWineSweetness(wine?.sweetness ?? "unknown");
    setGrapes((wine?.grapes ?? []).join(", "));
    setRegion(wine?.region ?? "");
    setDenomination(wine?.denomination ?? "");
    setCountry(wine?.country ?? "");
    setVintage(wine?.vintage != null ? String(wine.vintage) : "");
    setAbv(wine?.abv != null ? String(wine.abv) : "");
    setTastingNotes((wine?.tastingNotes ?? []).join(", "));
    setNotice(null);
  }, [selectedProduct]);

  const toggleAllergen = (allergen: ProductAllergen) => {
    setAllergens((current) =>
      current.includes(allergen)
        ? current.filter((item) => item !== allergen)
        : [...current, allergen],
    );
  };

  const save = async () => {
    if (!rid || !selectedProduct || saving) return;
    const caloriesValue = optionalNumber(calories);
    const vintageValue = optionalNumber(vintage);
    const abvValue = optionalNumber(abv);
    if (caloriesValue === null || vintageValue === null || abvValue === null) {
      setNotice("Revisa calorías, añada y graduación: deben ser números válidos.");
      return;
    }

    const gastronomy: ProductGastronomy = {};
    const ingredientList = splitList(ingredients);
    if (ingredientList.length) gastronomy.ingredients = ingredientList;
    if (allergensReviewed) gastronomy.allergens = allergens;
    if (caloriesValue !== undefined) gastronomy.caloriesKcal = caloriesValue;
    if (isWine) {
      gastronomy.wine = {
        style: wineStyle,
        body: wineBody,
        sweetness: wineSweetness,
        ...(splitList(grapes).length ? { grapes: splitList(grapes) } : {}),
        ...(region.trim() ? { region: region.trim() } : {}),
        ...(denomination.trim() ? { denomination: denomination.trim() } : {}),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(vintageValue !== undefined ? { vintage: Math.round(vintageValue) } : {}),
        ...(abvValue !== undefined ? { abv: abvValue } : {}),
        ...(splitList(tastingNotes).length
          ? { tastingNotes: splitList(tastingNotes) }
          : {}),
      };
    }

    setSaving(true);
    setNotice(null);
    try {
      await updateProductGastronomy({
        restaurantId: rid,
        productId: selectedProduct.id,
        gastronomy,
      });
      setNotice("Información gastronómica guardada.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "No se pudo guardar la información gastronómica.");
    } finally {
      setSaving(false);
    }
  };

  if (!rid) return null;

  return (
    <>
      <HostlyButton
        variant="secondary"
        size="touch"
        className="fixed right-4 bottom-[calc(1rem+var(--hostly-mobile-cta-min-h)+var(--hostly-op-gap-sm)+env(safe-area-inset-bottom))] z-[70] shadow-[var(--hostly-shadow-float)] sm:right-6 sm:bottom-[calc(1.5rem+var(--hostly-mobile-cta-min-h)+var(--hostly-op-gap-sm)+env(safe-area-inset-bottom))]"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-hostly-gastronomy-trigger
        onClick={() => setOpen(true)}
      >
        Info gastronómica
      </HostlyButton>

      {open ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-gastronomy-management-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="product-gastronomy-management-title" className="text-lg font-extrabold">
                  Información gastronómica
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Datos canónicos usados por TPV Pro y Sommelier Ultra.
                </p>
              </div>
              <HostlyButton variant="secondary" size="compact" disabled={saving} onClick={() => setOpen(false)}>
                Cerrar
              </HostlyButton>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Producto</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                disabled={saving || catalog.loading}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.nombre}</option>
                ))}
              </select>
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ingredientes</span>
                <textarea
                  className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={ingredients}
                  onChange={(event) => setIngredients(event.target.value)}
                  placeholder="Uno por línea o separados por comas"
                  disabled={saving}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Calorías por ración</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  inputMode="decimal"
                  value={calories}
                  onChange={(event) => setCalories(event.target.value)}
                  placeholder="Ej. 420"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <label className="flex items-start gap-2 text-sm font-bold text-amber-950">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={allergensReviewed}
                  onChange={(event) => setAllergensReviewed(event.target.checked)}
                  disabled={saving}
                />
                Información de alérgenos revisada por el restaurante
              </label>
              <p className="mt-1 text-xs text-amber-800">
                Si no se marca, Hostly mostrará “información no registrada”; nunca interpretará el producto como libre de alérgenos.
              </p>
              {allergensReviewed ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PRODUCT_ALLERGENS.map((allergen) => (
                    <label key={allergen} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={allergens.includes(allergen)}
                        onChange={() => toggleAllergen(allergen)}
                        disabled={saving}
                      />
                      {ALLERGEN_LABELS[allergen]}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
              <label className="flex items-center gap-2 text-sm font-bold text-violet-950">
                <input type="checkbox" checked={isWine} onChange={(event) => setIsWine(event.target.checked)} disabled={saving} />
                Es vino, cava, champán u otro vino espumoso
              </label>
              {isWine ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold text-slate-600">Estilo
                    <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" value={wineStyle} onChange={(event) => setWineStyle(event.target.value as ProductWineStyle)} disabled={saving}>
                      <option value="unknown">Por confirmar</option><option value="red">Tinto</option><option value="white">Blanco</option><option value="rose">Rosado</option><option value="sparkling">Espumoso</option><option value="sweet">Dulce</option><option value="fortified">Generoso</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">Dulzor
                    <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" value={wineSweetness} onChange={(event) => setWineSweetness(event.target.value as ProductWineSweetness)} disabled={saving}>
                      <option value="unknown">Por confirmar</option><option value="dry">Seco</option><option value="off_dry">Semiseco</option><option value="sweet">Dulce</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">Cuerpo
                    <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm" value={wineBody} onChange={(event) => setWineBody(event.target.value as ProductWineBody)} disabled={saving}>
                      <option value="unknown">Por confirmar</option><option value="light">Ligero</option><option value="medium">Medio</option><option value="full">Con cuerpo</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">Uvas<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={grapes} onChange={(event) => setGrapes(event.target.value)} placeholder="Tempranillo, Garnacha" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600">Denominación<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={denomination} onChange={(event) => setDenomination(event.target.value)} placeholder="Rioja DOCa" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600">Región<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="La Rioja" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600">País<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="España" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600">Añada<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" inputMode="numeric" value={vintage} onChange={(event) => setVintage(event.target.value)} placeholder="2019" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600">Alcohol %<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" inputMode="decimal" value={abv} onChange={(event) => setAbv(event.target.value)} placeholder="13.5" disabled={saving} /></label>
                  <label className="text-xs font-bold text-slate-600 sm:col-span-3">Notas / carácter<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={tastingNotes} onChange={(event) => setTastingNotes(event.target.value)} placeholder="Afrutado, mineral, cítrico…" disabled={saving} /></label>
                </div>
              ) : null}
            </div>

            {notice ? <p className="mt-4 text-sm font-semibold text-slate-700" role="status">{notice}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <HostlyButton variant="secondary" size="compact" disabled={saving} onClick={() => setOpen(false)}>Cancelar</HostlyButton>
              <HostlyButton variant="primary" size="compact" disabled={saving || !selectedProduct} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar"}</HostlyButton>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
