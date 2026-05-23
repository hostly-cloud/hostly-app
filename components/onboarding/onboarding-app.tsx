"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import CartaImportPremiumLayout from "@/components/carta/carta-import-premium-layout";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import { mockExtractMenuFromPhoto, type ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import {
  applyDefaultModifierFamilyIfEligible,
  fetchModifierFamiliesForRestaurante,
  findCartaCategoriaByNameLoose,
} from "@/lib/modificadores/default-modifier-family";
import {
  loadOnboardingCheckpoints,
  onboardingActivationPercent,
  type OnboardingCheckpointKey,
  type OnboardingCheckpoints,
  saveOnboardingCheckpoints,
} from "@/lib/hostly/onboarding-checkpoints";
import { loadRestaurantProfile, saveRestaurantProfile, type RestaurantProfile, TIPOS_NEGOCIO, MODELOS_VENTA } from "@/lib/hostly/restaurant-profile";
import { saveEscandalloCosteForPlato } from "@/lib/hostly/save-escandallo-coste-onboarding";
import {
  createPlatoDraft,
  loadPlatos,
  savePlatos,
  TIPOS_PRODUCTO_VENTA,
  type TipoProductoVenta,
} from "@/lib/platos-local";
import { loadStock, saveStock, UNIDADES_STOCK, newStockProductoId, type StockProducto, type UnidadStock } from "@/lib/stock-local";
import {
  defaultModulosForRol,
  loadUsuarios,
  newUsuarioId,
  saveUsuarios,
  USUARIO_ROLES,
  type UsuarioLocal,
  type UsuarioRol,
} from "@/lib/usuarios-local";

const STEP_CHECKPOINT: (OnboardingCheckpointKey | null)[] = ["negocio", "carta", "catalogo", "inventario", "usuarios", "escandallo", null];

const TIPO_KEYS: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

/** Inputs onboarding alineados con Hostly configLight / ice (compactos). */
const inp: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--hostly-table-divider-soft)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  minHeight: 38,
};

const lbl: CSSProperties = {
  display: "block",
  fontSize: 9.5,
  fontWeight: 600,
  color: "var(--hostly-ink-faint)",
  marginBottom: 4,
  letterSpacing: "0.085em",
  textTransform: "uppercase",
};

const onboardingLead: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--hostly-ink-muted)",
  fontWeight: 500,
};

const onboardingSectionTitle = "hostly-heading m-0 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-[color:var(--hostly-ink-strong)]";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function marginPct(coste: number, pvp: number): number | null {
  if (pvp <= 0 || !Number.isFinite(pvp)) return null;
  if (!Number.isFinite(coste)) return null;
  return ((pvp - coste) / pvp) * 100;
}

function marginTier(pct: number | null): "none" | "excelente" | "bueno" | "ajustado" | "peligro" {
  if (pct == null) return "none";
  if (pct > 75) return "excelente";
  if (pct >= 65) return "bueno";
  if (pct >= 55) return "ajustado";
  return "peligro";
}

const STOCK_SUGGESTIONS: { nombre: string; unidad: UnidadStock; stock_actual: number; stock_minimo: number }[] = [
  { nombre: "Arroz", unidad: "kg", stock_actual: 8, stock_minimo: 3 },
  { nombre: "Aceite de oliva", unidad: "l", stock_actual: 5, stock_minimo: 2 },
  { nombre: "Sal", unidad: "kg", stock_actual: 2, stock_minimo: 0.5 },
  { nombre: "Tomate", unidad: "kg", stock_actual: 6, stock_minimo: 4 },
  { nombre: "Cerveza", unidad: "uds", stock_actual: 120, stock_minimo: 48 },
  { nombre: "Vino tinto", unidad: "uds", stock_actual: 36, stock_minimo: 12 },
  { nombre: "Refresco", unidad: "uds", stock_actual: 72, stock_minimo: 24 },
  { nombre: "Leche", unidad: "l", stock_actual: 10, stock_minimo: 4 },
  { nombre: "Café", unidad: "kg", stock_actual: 2, stock_minimo: 0.5 },
  { nombre: "Pasta", unidad: "kg", stock_actual: 5, stock_minimo: 2 },
];

type IngLine = { id: string; stockId: string; cantidad: string; costeLinea: string };

const ONBOARDING_CP_ORDER: readonly OnboardingCheckpointKey[] = [
  "negocio",
  "carta",
  "catalogo",
  "inventario",
  "usuarios",
  "escandallo",
];

function lastCompletedCheckpointLabel(cp: Pick<Record<OnboardingCheckpointKey, boolean>, OnboardingCheckpointKey>, t: (k: string) => string): string | null {
  const map: Record<OnboardingCheckpointKey, string> = {
    negocio: t("onboarding.chkNegocio"),
    carta: t("onboarding.chkCarta"),
    catalogo: t("onboarding.chkCatalogo"),
    inventario: t("onboarding.chkInventario"),
    usuarios: t("onboarding.chkUsuarios"),
    escandallo: t("onboarding.chkEscandallo"),
  };
  for (let i = ONBOARDING_CP_ORDER.length - 1; i >= 0; i--) {
    const k = ONBOARDING_CP_ORDER[i];
    if (cp[k]) return map[k];
  }
  return null;
}

function groupCatalogRowsBySuggestedCategory(rows: ExtractedMenuRow[]): { catKey: string; items: ExtractedMenuRow[] }[] {
  const m = new Map<string, ExtractedMenuRow[]>();
  for (const r of rows) {
    const c = (r.categoria ?? "").trim() || "—";
    const arr = m.get(c);
    if (arr) arr.push(r);
    else m.set(c, [r]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([catKey, items]) => ({ catKey, items }));
}

export default function OnboardingApp() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [checkpoints, setCheckpoints] = useState<OnboardingCheckpoints>(loadOnboardingCheckpoints);
  const [profile, setProfile] = useState<RestaurantProfile>(loadRestaurantProfile);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = useCallback((msg: string) => {
    setSavedHint(msg);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSavedHint(null), 2200);
  }, []);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [procBusy, setProcBusy] = useState(false);
  const [cartaIaPhase, setCartaIaPhase] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!procBusy) {
      setCartaIaPhase(0);
      return;
    }
    const id = setInterval(() => setCartaIaPhase((p) => (p + 1) % 4), 880);
    return () => clearInterval(id);
  }, [procBusy]);

  const [catalogDraft, setCatalogDraft] = useState<ExtractedMenuRow[]>([]);
  const [catFilter, setCatFilter] = useState<"all" | TipoProductoVenta>("all");

  const [stockRows, setStockRows] = useState<StockProducto[]>([]);
  const [stockSearch, setStockSearch] = useState("");

  const [uNombre, setUNombre] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uRol, setURol] = useState<UsuarioRol>("operativo");
  const [usersList, setUsersList] = useState<UsuarioLocal[]>([]);

  const [escPlatoId, setEscPlatoId] = useState<string>("");
  const [escLines, setEscLines] = useState<IngLine[]>([]);
  const [escSaving, setEscSaving] = useState(false);
  const [escErr, setEscErr] = useState<string | null>(null);

  const rid = getBrowserRestauranteId();

  useEffect(() => {
    setStockRows(loadStock());
    setUsersList(loadUsuarios());
  }, [step]);

  const markCheckpoint = useCallback((key: OnboardingCheckpointKey) => {
    setCheckpoints((prev) => {
      const next = { ...prev, [key]: true };
      saveOnboardingCheckpoints(next);
      return next;
    });
  }, []);

  const stepLabels = useMemo(
    () => [
      t("onboarding.stepNegocio"),
      t("onboarding.stepCarta"),
      t("onboarding.stepCatalogo"),
      t("onboarding.stepInventario"),
      t("onboarding.stepUsuarios"),
      t("onboarding.stepEscandallo"),
      t("onboarding.stepActivacion"),
    ],
    [t],
  );

  const platos = useMemo(() => loadPlatos(rid), [rid, step, checkpoints]);

  const costeSum = useMemo(() => {
    let s = 0;
    for (const ln of escLines) {
      const c = Number(String(ln.costeLinea).replace(",", "."));
      if (Number.isFinite(c) && c >= 0) s += c;
    }
    return Math.round(s * 100) / 100;
  }, [escLines]);

  const escPlato = useMemo(() => platos.find((p) => p.id === escPlatoId), [platos, escPlatoId]);
  const pvp = escPlato?.precioVenta ?? 0;
  const mPct = marginPct(costeSum, pvp);
  const mTier = marginTier(mPct);

  const filteredCatalog = useMemo(() => {
    if (catFilter === "all") return catalogDraft;
    return catalogDraft.filter((r) => r.tipoVenta === catFilter);
  }, [catalogDraft, catFilter]);

  const catalogAssistStats = useMemo(() => {
    if (catalogDraft.length === 0) return null;
    const cats = new Set(catalogDraft.map((r) => (r.categoria ?? "").trim() || "—"));
    return {
      n: catalogDraft.length,
      catCount: cats.size,
      selected: catalogDraft.filter((r) => r.selected).length,
      loosePrice: catalogDraft.filter((r) => !Number.isFinite(r.precio) || r.precio <= 0).length,
    };
  }, [catalogDraft]);

  const sideStoryLines = useMemo(
    () =>
      [
        t("onboarding.sideStory0"),
        t("onboarding.sideStory1"),
        t("onboarding.sideStory2"),
        t("onboarding.sideStory3"),
        t("onboarding.sideStory4"),
        t("onboarding.sideStory5"),
        t("onboarding.sideStory6"),
      ] as const,
    [t],
  );

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    const ok = f.type.startsWith("image/") || f.type === "application/pdf";
    if (!ok) return;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  }, []);

  const clearCartaFile = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
  }, []);

  const loadExampleMenu = useCallback(async () => {
    const { createExampleMenuImageFile } = await import("@/lib/carta/example-menu-image");
    const img = await createExampleMenuImageFile(locale === "en" ? "en" : "es");
    pickFile(img);
  }, [locale, pickFile]);

  const runAnalyze = async () => {
    if (!file) return;
    setProcBusy(true);
    try {
      const rows = await mockExtractMenuFromPhoto(file);
      setCatalogDraft(rows);
      markCheckpoint("carta");
      setStep(2);
      flashSaved(t("onboarding.flashAnalyzed"));
    } finally {
      setProcBusy(false);
    }
  };

  const saveNegocio = () => {
    if (!profile.nombre.trim()) return;
    saveRestaurantProfile(profile);
    markCheckpoint("negocio");
    setStep(1);
    flashSaved(t("onboarding.flashSaved"));
  };

  const createCatalog = async () => {
    const sel = catalogDraft.filter((r) => r.selected && r.nombre.trim());
    const [cartaCats, cartaFams, modifierFamilies] = await Promise.all([
      fetchCartaCategorias(rid),
      fetchCartaFamilias(rid),
      fetchModifierFamiliesForRestaurante(rid),
    ]);
    const famByMenuId = new Map(cartaFams.map((f) => [f.id, f] as const));
    let next = [...loadPlatos(rid)];
    for (const r of sel) {
      const cat = findCartaCategoriaByNameLoose(cartaCats, (r.categoria ?? "").trim() || "General");
      const menuName = cat?.cartaFamiliaId != null ? famByMenuId.get(cat.cartaFamiliaId)?.name : undefined;
      let plato = createPlatoDraft(rid, {
        nombre: r.nombre.trim(),
        categoria: cat?.name ?? ((r.categoria ?? "").trim() || "General"),
        categoriaCartaId: cat?.id,
        cartaFamiliaId: cat?.cartaFamiliaId?.trim() || undefined,
        precioVenta: Number.isFinite(r.precio) ? r.precio : 0,
        tipoVenta: r.tipoVenta,
        activo: true,
      });
      plato = applyDefaultModifierFamilyIfEligible(plato, {
        selectedCartaCategoria: cat,
        cartaMenuFamiliaName: menuName,
        modifierFamilies,
      });
      next.push(plato);
    }
    savePlatos(rid, next);
    markCheckpoint("catalogo");
    setStep(3);
    flashSaved(t("onboarding.flashCatalog"));
  };

  const saveInventario = () => {
    saveStock(stockRows);
    markCheckpoint("inventario");
    setStep(4);
    flashSaved(t("onboarding.flashStock"));
  };

  const addSuggested = () => {
    let cur = [...stockRows];
    const have = new Set(cur.map((x) => normalizeName(x.nombre)));
    for (const s of STOCK_SUGGESTIONS) {
      if (have.has(normalizeName(s.nombre))) continue;
      cur.push({
        id: newStockProductoId(),
        nombre: s.nombre,
        unidad: s.unidad,
        stock_actual: s.stock_actual,
        stock_minimo: s.stock_minimo,
      });
      have.add(normalizeName(s.nombre));
    }
    setStockRows(cur);
    flashSaved(t("onboarding.flashSuggested"));
  };

  const addManualStock = () => {
    setStockRows((prev) => [
      ...prev,
      { id: newStockProductoId(), nombre: "", unidad: "uds", stock_actual: 0, stock_minimo: 0 },
    ]);
  };

  const addUser = () => {
    const nom = uNombre.trim();
    const em = uEmail.trim();
    if (nom.length < 2 || !em.includes("@")) return;
    const nu: UsuarioLocal = {
      id: newUsuarioId(),
      nombre: nom,
      email: em,
      rol: uRol,
      activo: true,
      modulos: defaultModulosForRol(uRol),
    };
    const next = [...loadUsuarios(), nu];
    saveUsuarios(next);
    setUsersList(next);
    setUNombre("");
    setUEmail("");
    flashSaved(t("onboarding.flashUser"));
  };

  const continueUsers = () => {
    markCheckpoint("usuarios");
    setStep(5);
  };

  const addEscLine = () => {
    const st = loadStock();
    const first = st[0]?.id ?? "";
    setEscLines((prev) => [...prev, { id: `ln-${Date.now()}`, stockId: first, cantidad: "1", costeLinea: "0" }]);
  };

  useEffect(() => {
    if (step !== 5) return;
    const st = loadStock();
    if (!escPlatoId && platos.length) setEscPlatoId(platos[0].id);
    if (escLines.length === 0 && st.length) {
      setEscLines([{ id: "1", stockId: st[0].id, cantidad: "1", costeLinea: "0" }]);
    }
  }, [step, platos, escPlatoId, escLines.length]);

  const saveEscandallo = async () => {
    if (!escPlatoId || costeSum < 0) return;
    setEscErr(null);
    setEscSaving(true);
    try {
      const res = await saveEscandalloCosteForPlato(escPlatoId, costeSum);
      if (!res.ok) {
        setEscErr(res.error ?? "Error");
        return;
      }
      markCheckpoint("escandallo");
      setStep(6);
      flashSaved(t("onboarding.flashEscandallo"));
    } finally {
      setEscSaving(false);
    }
  };

  const activationPct = onboardingActivationPercent(checkpoints);
  const journeyPct = Math.min(100, Math.round((step / 6) * 100));
  const sideStoryLine = sideStoryLines[Math.min(step, 6)];
  const lastMarkedLabel = lastCompletedCheckpointLabel(checkpoints, t);

  const sideChecklist: { key: OnboardingCheckpointKey; label: string }[] = [
    { key: "negocio", label: t("onboarding.chkNegocio") },
    { key: "carta", label: t("onboarding.chkCarta") },
    { key: "catalogo", label: t("onboarding.chkCatalogo") },
    { key: "inventario", label: t("onboarding.chkInventario") },
    { key: "usuarios", label: t("onboarding.chkUsuarios") },
    { key: "escandallo", label: t("onboarding.chkEscandallo") },
  ];

  const renderStepper = () => {
    const n = stepLabels.length;
    const progressPct = n <= 1 ? (step >= n - 1 ? 100 : 0) : Math.min(100, Math.round((step / Math.max(n - 1, 1)) * 100));
    return (
      <div
        style={{
          flexShrink: 0,
          marginBottom: 6,
          borderRadius: 12,
          border: "1px solid var(--hostly-table-divider-soft)",
          background: "var(--hostly-surface-card-solid)",
          padding: "4px 4px 3px",
          boxShadow: "var(--hostly-shadow-hairline)",
          transition: "border-color 0.22s ease, box-shadow 0.26s ease",
        }}
      >
        <div style={{ padding: "0 2px 6px", borderBottom: "1px solid var(--hostly-table-divider-faint)" }}>
          <div
            style={{
              height: 3,
              borderRadius: 999,
              background: "color-mix(in srgb, var(--hostly-table-divider-soft) 55%, transparent)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--hostly-accent) 52%, transparent), var(--hostly-accent))",
                transition: "width 0.22s ease",
              }}
            />
          </div>
        </div>
        <div
          role="navigation"
          aria-label="Onboarding"
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            overflowX: "auto",
            paddingTop: 2,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
        >
          {stepLabels.flatMap((label, i) => {
            const active = i === step;
            const cpKey = STEP_CHECKPOINT[i];
            const stepDone = cpKey != null && checkpoints[cpKey];
            const isPast = i < step;
            const clickable = i <= step;
            const stepEl = (
              <button
                key={label}
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => {
                  if (i <= step) setStep(i);
                }}
                style={{
                  flex: "1 1 0%",
                  minWidth: "min(128px, 22vw)",
                  border: "none",
                  margin: 0,
                  background: active
                    ? "var(--hostly-info-soft)"
                    : stepDone || isPast
                      ? "color-mix(in srgb, var(--hostly-accent-soft) 38%, transparent)"
                      : "transparent",
                  color: active
                    ? "var(--hostly-navy-deep)"
                    : stepDone || isPast
                      ? "var(--hostly-accent)"
                      : "var(--hostly-ink-soft)",
                  padding: "6px 9px",
                  borderRadius: 9,
                  fontSize: 10,
                  fontWeight: 660,
                  letterSpacing: "-0.01em",
                  cursor: clickable ? "pointer" : "default",
                  opacity: clickable ? 1 : 0.45,
                  lineHeight: 1.22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 6,
                  textAlign: "left",
                  boxShadow: active ? "inset 0 0 0 1px color-mix(in srgb, var(--hostly-accent) 14%, transparent)" : "none",
                  transition: "background 0.2s ease, box-shadow 0.22s ease, opacity 0.2s ease",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    width: 16,
                    height: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 800,
                    background: stepDone || isPast ? "color-mix(in srgb, var(--hostly-success-soft) 94%, transparent)" : "var(--hostly-table-head-surface)",
                    color: active ? "var(--hostly-navy-deep)" : stepDone ? "var(--hostly-accent)" : "var(--hostly-ink-muted)",
                  }}
                >
                  {stepDone && !active ? "✓" : i + 1}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    wordBreak: "break-word",
                  }}
                >
                  {label}
                </span>
              </button>
            );

            const sep =
              i > 0 ? (
                <div
                  key={`sep-${label}`}
                  style={{
                    width: 1,
                    alignSelf: "stretch",
                    margin: "5px 0",
                    flexShrink: 0,
                    background: "var(--hostly-table-divider-faint)",
                  }}
                  aria-hidden
                />
              ) : null;
            return sep ? [sep, stepEl] : [stepEl];
          })}
        </div>
      </div>
    );
  };

  const panelMain = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.negocioTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.negocioSub")}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>{t("onboarding.fieldNombre")}</label>
                <input style={inp} value={profile.nombre} onChange={(e) => setProfile({ ...profile, nombre: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldTipo")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tipoNegocio} onChange={(e) => setProfile({ ...profile, tipoNegocio: e.target.value as RestaurantProfile["tipoNegocio"] })}>
                  {TIPOS_NEGOCIO.map((x) => (
                    <option key={x} value={x}>
                      {t(`onboarding.tipo.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldEmpleados")}</label>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  value={profile.empleadosAprox}
                  onChange={(e) => setProfile({ ...profile, empleadosAprox: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldCocina")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tieneCocina ? "1" : "0"} onChange={(e) => setProfile({ ...profile, tieneCocina: e.target.value === "1" })}>
                  <option value="1">{t("onboarding.yes")}</option>
                  <option value="0">{t("onboarding.no")}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldBarra")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tieneBarra ? "1" : "0"} onChange={(e) => setProfile({ ...profile, tieneBarra: e.target.value === "1" })}>
                  <option value="1">{t("onboarding.yes")}</option>
                  <option value="0">{t("onboarding.no")}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldModelo")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.modeloVenta} onChange={(e) => setProfile({ ...profile, modeloVenta: e.target.value as RestaurantProfile["modeloVenta"] })}>
                  {MODELOS_VENTA.map((x) => (
                    <option key={x} value={x}>
                      {t(`onboarding.modelo.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={saveNegocio}
              disabled={!profile.nombre.trim()}
              className="hostly-button-primary mt-0.5 self-start px-4 py-2 text-[13px] font-semibold"
            >
              {t("onboarding.ctaSaveContinue")}
            </button>
          </div>
        );
      case 1:
        return (
          <CartaImportPremiumLayout
            variant="onboarding"
            accept="image/*,application/pdf"
            showPdfHint
            file={file}
            previewUrl={previewUrl}
            dragOver={dragOver}
            busy={procBusy}
            iaPhaseIndex={cartaIaPhase}
            wizardActiveStep={file || procBusy ? 2 : 1}
            wizardCompletedThrough={file ? 1 : 0}
            fileRef={fileRef}
            onFileInputChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files[0] ?? null);
            }}
            onOpenFileDialog={() => fileRef.current?.click()}
            onAnalyze={runAnalyze}
            onExample={loadExampleMenu}
            onClearFile={clearCartaFile}
            showHero
            headerActions={
              <>
                <button type="button" onClick={() => router.push("/dashboard/carta")} className="hostly-button-secondary min-h-[36px] whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold">
                  {t("onboarding.cartaManual")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markCheckpoint("carta");
                    setCatalogDraft([]);
                    setStep(2);
                    flashSaved(t("onboarding.flashSaved"));
                  }}
                  className="hostly-button-secondary border-[var(--hostly-table-divider-soft)] px-3 py-1.5 text-[12px] font-semibold !bg-transparent !text-[color:var(--hostly-ink-muted)] hover:!bg-[var(--hostly-table-row-hover)]"
                >
                  {t("onboarding.cartaSkip")}
                </button>
              </>
            }
          />
        );
      case 2: {
        const nPlatos = catalogDraft.filter((x) => x.tipoVenta === "plato").length;
        const nBeb = catalogDraft.filter((x) => x.tipoVenta === "bebida").length;
        const groups = groupCatalogRowsBySuggestedCategory(filteredCatalog);
        const iaRowColumns = "38px minmax(140px,2.4fr) minmax(100px,1fr) minmax(108px,1fr) minmax(84px,0.75fr)" as const;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h2 className={onboardingSectionTitle}>{t("onboarding.catalogTitle")}</h2>
              <span className="text-[11px] font-semibold text-[color:var(--hostly-ink-muted)]">
                {t("onboarding.catalogCount", { n: String(catalogDraft.length) })}
              </span>
            </div>
            <p style={{ ...onboardingLead, marginBottom: -2 }}>{t("onboarding.catalogAssistLead")}</p>
            {catalogAssistStats ? (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                  background: "color-mix(in srgb, var(--hostly-info-soft) 70%, transparent)",
                  boxShadow: "var(--hostly-shadow-hairline)",
                }}
              >
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--hostly-accent) 78%, transparent)" }}>
                  {t("onboarding.catalogAssistEyebrow")}
                </div>
                <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--hostly-navy-deep)", fontWeight: 590 }}>{t("onboarding.catalogAssistSub")}</p>
                <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.42, fontWeight: 600, color: "var(--hostly-navy-deep)" }}>
                  {t("onboarding.catalogAssistMeta", {
                    n: String(catalogAssistStats.n),
                    cats: String(catalogAssistStats.catCount),
                    sel: String(catalogAssistStats.selected),
                  })}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.42, fontWeight: 605, color: "var(--hostly-ink-muted)" }}>
                  {catalogAssistStats.loosePrice > 0 ? t("onboarding.catalogAssistPrices", { n: String(catalogAssistStats.loosePrice) }) : t("onboarding.catalogAssistNoPricesOk")}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["all", "plato", "bebida"] as const).map((f) => {
                const nf = f === "all" ? catalogDraft.length : f === "plato" ? nPlatos : nBeb;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCatFilter(f)}
                    style={{
                      border:
                        catFilter === f ? "1px solid color-mix(in srgb, var(--hostly-accent) 28%, transparent)" : "1px solid var(--hostly-table-divider-soft)",
                      background: catFilter === f ? "var(--hostly-accent-soft)" : "transparent",
                      color: catFilter === f ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                      padding: "4px 9px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 650,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 7,
                      transition: "border-color 0.18s ease, background 0.18s ease",
                    }}
                  >
                    <span>{f === "all" ? t("onboarding.filterAll") : t(TIPO_KEYS[f])}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        opacity: nf ? 1 : 0.45,
                        color: catFilter === f ? "var(--hostly-navy-deep)" : "var(--hostly-ink-faint)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {nf}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              style={{
                borderRadius: 10,
                border: "1px solid var(--hostly-table-divider-soft)",
                overflow: "hidden",
                boxShadow: "var(--hostly-shadow-hairline)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: iaRowColumns,
                  gap: 8,
                  padding: "7px 11px",
                  borderBottom: "1px solid var(--hostly-table-divider-soft)",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: "var(--hostly-table-head-surface)",
                  fontSize: 9,
                  fontWeight: 650,
                  color: "var(--hostly-ink-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <span />
                <span>{t("carta.colNombre")}</span>
                <span>{t("carta.colTipo")}</span>
                <span>{t("carta.colCategoria")}</span>
                <span style={{ textAlign: "right", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                  {t("carta.colPrecio")}
                  <span
                    aria-hidden
                    style={{
                      fontSize: 7.5,
                      padding: "1px 4px",
                      borderRadius: 4,
                      fontWeight: 750,
                      letterSpacing: "0.05em",
                      color: "var(--hostly-navy-deep)",
                      background: "color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--hostly-accent) 16%, transparent)",
                    }}
                  >
                    IA
                  </span>
                </span>
              </div>
              {groups.map(({ catKey, items }) => (
                <div key={catKey}>
                  <div
                    style={{
                      padding: "5px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      background: "color-mix(in srgb, var(--hostly-table-head-surface) 94%, transparent)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 720, letterSpacing: "0.04em", color: "var(--hostly-navy-deep)" }}>
                      {t("onboarding.catalogAssistGroupLabel", { cat: catKey })}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 630, fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink-muted)" }}>{items.length}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 8,
                        fontWeight: 740,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "color-mix(in srgb, var(--hostly-accent) 65%, transparent)",
                      }}
                    >
                      {t("onboarding.catalogAssistGroupHint")}
                    </span>
                  </div>
                  {items.map((r) => (
                    <div
                      key={r.tempId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: iaRowColumns,
                        gap: 8,
                        padding: "7px 11px",
                        alignItems: "center",
                        borderBottom: "1px solid var(--hostly-table-divider-faint)",
                        background: "var(--hostly-surface-card-solid)",
                        borderLeft: "2px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <input type="checkbox" checked={r.selected} onChange={() => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, selected: !x.selected } : x)))} style={{ width: 16, height: 16 }} />
                      <input style={{ ...inp, minHeight: 36, padding: "6px 8px", fontSize: 13 }} value={r.nombre} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, nombre: e.target.value } : x)))} />
                      <select style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 12, cursor: "pointer" }} value={r.tipoVenta} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, tipoVenta: e.target.value as TipoProductoVenta } : x)))}>
                        {TIPOS_PRODUCTO_VENTA.map((tv) => (
                          <option key={tv} value={tv}>
                            {t(TIPO_KEYS[tv])}
                          </option>
                        ))}
                      </select>
                      <input style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 12 }} value={r.categoria} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, categoria: e.target.value } : x)))} />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{
                          ...inp,
                          minHeight: 36,
                          padding: "6px",
                          fontSize: 13,
                          textAlign: "right",
                          borderColor:
                            Number.isFinite(r.precio) && r.precio > 0 ? "var(--hostly-table-divider-soft)" : "color-mix(in srgb, var(--hostly-accent) 22%, var(--hostly-table-divider-soft))",
                          background:
                            Number.isFinite(r.precio) && r.precio > 0 ? "var(--hostly-surface-card-solid)" : "color-mix(in srgb, var(--hostly-accent-soft) 55%, transparent)",
                        }}
                        value={r.precio}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n) || n < 0) return;
                          setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, precio: Math.round(n * 100) / 100 } : x)));
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => void createCatalog()} className="hostly-button-primary px-4 py-2 text-[13px] font-semibold">
                {t("onboarding.ctaCreateCatalog")}
              </button>
              <button type="button" onClick={() => setStep(1)} className="hostly-button-secondary px-3 py-2 text-[12px] font-semibold">
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          </div>
        );
      }
      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.stockTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.stockSub")}</p>
            <input style={inp} placeholder={t("onboarding.stockSearch")} value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STOCK_SUGGESTIONS.map((s) => (
                <button
                  key={s.nombre}
                  type="button"
                  onClick={() => {
                    if (stockRows.some((x) => normalizeName(x.nombre) === normalizeName(s.nombre))) return;
                    setStockRows((prev) => [...prev, { id: newStockProductoId(), ...s }]);
                  }}
                  style={{
                    border: "1px solid var(--hostly-table-divider-soft)",
                    background: "var(--hostly-table-row-hover)",
                    color: "var(--hostly-ink)",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  + {s.nombre}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={addSuggested} className="hostly-button-secondary text-[12px] font-semibold px-3 py-1.5 min-h-[36px] border-[color-mix(in_srgb,var(--hostly-accent)_22%,transparent)] !bg-[var(--hostly-info-soft)]">
                {t("onboarding.stockAddSuggested")}
              </button>
              <button type="button" onClick={addManualStock} className="hostly-button-secondary text-[12px] font-semibold px-3 py-1.5 min-h-[36px] !bg-transparent !text-[color:var(--hostly-ink-muted)]">
                {t("onboarding.stockAddManual")}
              </button>
            </div>
            <div style={{ border: "1px solid var(--hostly-table-divider-soft)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--hostly-shadow-hairline)" }}>
              {stockRows
                .filter((r) => normalizeName(r.nombre).includes(normalizeName(stockSearch)) || !stockSearch.trim())
                .map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px,3fr) minmax(88px,1fr) minmax(96px,1fr) minmax(96px,1fr)",
                      gap: 10,
                      padding: "8px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      alignItems: "center",
                      background: "var(--hostly-surface-card-solid)",
                    }}
                  >
                    <input style={{ ...inp, minHeight: 36 }} value={r.nombre} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, nombre: e.target.value } : x)))} />
                    <select style={{ ...inp, minHeight: 36, cursor: "pointer" }} value={r.unidad} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unidad: e.target.value as UnidadStock } : x)))}>
                      {UNIDADES_STOCK.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input type="number" style={{ ...inp, minHeight: 36 }} value={r.stock_actual} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_actual: Number(e.target.value) || 0 } : x)))} />
                    <input type="number" style={{ ...inp, minHeight: 36 }} value={r.stock_minimo} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_minimo: Number(e.target.value) || 0 } : x)))} />
                  </div>
                ))}
            </div>
            <button type="button" onClick={saveInventario} className="hostly-button-primary self-start px-4 py-2 text-[13px] font-semibold">
              {t("onboarding.ctaSaveStock")}
            </button>
          </div>
        );
      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.usersTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.usersSub")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 10 }}>
              <div>
                <label style={lbl}>{t("onboarding.userNombre")}</label>
                <input style={inp} value={uNombre} onChange={(e) => setUNombre(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.userEmail")}</label>
                <input style={inp} type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.userRol")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={uRol} onChange={(e) => setURol(e.target.value as UsuarioRol)}>
                  {USUARIO_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`onboarding.rol.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={addUser} className="hostly-button-secondary min-h-[36px] px-3 py-1.5 text-[12px] font-semibold border-[color-mix(in_srgb,var(--hostly-accent)_25%,transparent)] !bg-[var(--hostly-accent-soft)] !text-[color:var(--hostly-navy-deep)]">
                {t("onboarding.ctaAddUser")}
              </button>
              <button type="button" onClick={continueUsers} className="hostly-button-primary min-h-[36px] px-4 py-1.5 text-[12px] font-semibold">
                {t("onboarding.ctaUsersContinue")}
              </button>
            </div>
            <p className="hostly-muted mt-0 text-[11px] leading-snug">{t("onboarding.usersRolesHint")}</p>
            <div style={{ border: "1px solid var(--hostly-table-divider-soft)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--hostly-shadow-hairline)" }}>
              {usersList.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 100px",
                    gap: 8,
                    padding: "7px 9px",
                    borderBottom: "1px solid var(--hostly-table-divider-faint)",
                    fontSize: 12,
                    background: "var(--hostly-surface-card-solid)",
                    color: "var(--hostly-ink-strong)",
                  }}
                >
                  <span>{u.nombre}</span>
                  <span className="text-[color:var(--hostly-ink-muted)]">{u.email}</span>
                  <span className="font-semibold">{t(`onboarding.rol.${u.rol}`)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 5:
        if (platos.length === 0) {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className={onboardingSectionTitle}>{t("onboarding.escTitle")}</h2>
              <p style={onboardingLead}>{t("onboarding.escNoPlatos")}</p>
              <button type="button" onClick={() => setStep(2)} className="hostly-button-secondary self-start px-3 py-2 text-[12px] font-semibold">
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.escTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.escSub")}</p>
            <div>
              <label style={lbl}>{t("onboarding.escSelectPlato")}</label>
              <select style={{ ...inp, cursor: "pointer" }} value={escPlatoId} onChange={(e) => setEscPlatoId(e.target.value)}>
                {platos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.precioVenta.toFixed(2)} €
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={addEscLine} className="hostly-button-secondary self-start px-2.5 py-1.5 text-[12px] font-semibold">
              + {t("onboarding.escAddLine")}
            </button>
            <div style={{ border: "1px solid var(--hostly-table-divider-soft)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--hostly-shadow-hairline)" }}>
              {escLines.map((ln) => {
                const st = loadStock();
                return (
                  <div
                    key={ln.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px,2.75fr) minmax(76px,0.95fr) minmax(100px,1fr)",
                      gap: 10,
                      padding: "8px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      alignItems: "center",
                      background: "var(--hostly-surface-card-solid)",
                    }}
                  >
                    <select style={{ ...inp, minHeight: 36, cursor: "pointer" }} value={ln.stockId} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, stockId: e.target.value } : x)))}>
                      {st.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                    <input style={{ ...inp, minHeight: 36 }} value={ln.cantidad} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, cantidad: e.target.value } : x)))} />
                    <input style={{ ...inp, minHeight: 36 }} value={ln.costeLinea} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, costeLinea: e.target.value } : x)))} placeholder="€" />
                  </div>
                );
              })}
            </div>
            {escErr ? <div style={{ color: "#b42318", fontSize: 12 }}>{escErr}</div> : null}
            <button
              type="button"
              disabled={escSaving || !escPlatoId || platos.length === 0}
              onClick={saveEscandallo}
              className={`hostly-button-primary mt-1 self-start px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${escSaving ? "cursor-wait" : ""}`}
            >
              {escSaving ? "…" : t("onboarding.ctaSaveEsc")}
            </button>
          </div>
        );
      case 6:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
            <h2 className="hostly-heading m-0 text-[18px] font-semibold text-[color:var(--hostly-accent)]">{t("onboarding.doneTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.doneSub")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 8 }}>
              {[
                { label: t("onboarding.statCatalog"), value: String(loadPlatos(rid).length) },
                { label: t("onboarding.statStock"), value: String(loadStock().length) },
                { label: t("onboarding.statUsers"), value: String(loadUsuarios().length) },
                { label: t("onboarding.statEsc"), value: checkpoints.escandallo ? "✓" : "—" },
              ].map((x) => (
                <div
                  key={x.label}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--hostly-table-divider-soft)",
                    background: "var(--hostly-surface-card-solid)",
                    boxShadow: "var(--hostly-shadow-hairline)",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 650, color: "var(--hostly-ink-faint)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{x.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 720, color: "var(--hostly-ink-strong)", marginTop: 4 }}>{x.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {sideChecklist.map((c) => (
                <div
                  key={c.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: checkpoints[c.key] ? "var(--hostly-accent)" : "var(--hostly-ink-muted)",
                  }}
                >
                  <span style={{ opacity: checkpoints[c.key] ? 1 : 0.45 }}>{checkpoints[c.key] ? "✓" : "○"}</span>
                  {c.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => router.push("/dashboard")} className="hostly-button-primary px-5 py-2.5 text-[14px] font-semibold">
                {t("onboarding.ctaEnterDashboard")}
              </button>
              <Link href="/dashboard/carta" className="hostly-button-secondary inline-flex items-center px-4 py-2 text-[13px] font-semibold no-underline">
                {t("onboarding.ctaReviewCarta")}
              </Link>
              <Link href="/dashboard/stock" className="hostly-button-secondary inline-flex items-center px-4 py-2 text-[13px] font-semibold no-underline">
                {t("onboarding.ctaGoStock")}
              </Link>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const sidePanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 650,
              color: "var(--hostly-ink-faint)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {t("onboarding.sideLiveOps")}
          </div>
          {procBusy && step === 1 ? (
            <span title="" className="hostly-onboarding-op-dot inline-block shrink-0 rounded-full" style={{ width: 6, height: 6, background: "var(--hostly-accent)" }} aria-hidden />
          ) : escSaving && step === 5 ? (
            <span className="hostly-onboarding-op-dot inline-block shrink-0 rounded-full" style={{ width: 6, height: 6, background: "var(--hostly-accent)" }} aria-hidden />
          ) : (
            <span
              className="inline-block shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "color-mix(in srgb, var(--hostly-accent) 32%, var(--hostly-table-divider-soft))",
              }}
              aria-hidden
            />
          )}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.45, color: "var(--hostly-ink-muted)", fontWeight: 560 }}>{t("onboarding.sideLiveOpsSub")}</p>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--hostly-navy-deep)", fontWeight: 600 }}>{sideStoryLine}</p>

      {procBusy && step === 1 ? (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.42,
            fontWeight: 600,
            padding: "6px 8px",
            borderRadius: 9,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-info-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {t("onboarding.sideActivityReadingCarta")}
        </div>
      ) : null}
      {escSaving && step === 5 ? (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.42,
            fontWeight: 600,
            padding: "6px 8px",
            borderRadius: 9,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-success-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {t("onboarding.sideActivitySavingMargins")}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 9,
          fontWeight: 650,
          color: "var(--hostly-ink-faint)",
          letterSpacing: "0.085em",
          textTransform: "uppercase",
        }}
      >
        {t("onboarding.sideJourneyLegend")}
      </div>
      <div style={{ marginTop: -4 }}>
        <div
          style={{
            height: 3,
            borderRadius: 999,
            background: "color-mix(in srgb, var(--hostly-table-divider-soft) 90%, transparent)",
            overflow: "hidden",
            border: "1px solid var(--hostly-table-divider-faint)",
          }}
        >
          <div style={{ width: `${journeyPct}%`, height: "100%", borderRadius: 999, background: "var(--hostly-accent)", transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)" }} />
        </div>
      </div>

      <div
        style={{
          fontSize: 9,
          fontWeight: 650,
          marginTop: 2,
          color: "var(--hostly-ink-faint)",
          letterSpacing: "0.085em",
          textTransform: "uppercase",
          paddingTop: 6,
          borderTop: "1px solid var(--hostly-table-divider-faint)",
        }}
      >
        {t("onboarding.sideSyncedLegend")}
      </div>
      <div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "var(--hostly-table-divider-faint)",
            overflow: "hidden",
            border: "1px solid var(--hostly-table-divider-soft)",
          }}
        >
          <div
            style={{
              width: `${activationPct}%`,
              height: "100%",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--hostly-accent-soft) 100%, var(--hostly-accent))",
              transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <div style={{ marginTop: 7, fontSize: 13.5, fontWeight: 720, color: "var(--hostly-navy-deep)", letterSpacing: "-0.03em", lineHeight: 1.22 }}>
          {t("onboarding.sidePctComposite", { journey: String(journeyPct), sync: String(activationPct) })}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 620, marginTop: 4, color: "var(--hostly-navy-deep)" }}>
          {t("onboarding.sideStepCue", { n: String(Math.min(step + 1, stepLabels.length)), stepName: stepLabels[step] ?? "" })}
        </div>
        <div style={{ fontSize: 9, fontWeight: 560, marginTop: 2, color: "var(--hostly-ink-muted)", lineHeight: 1.35 }}>
          {t("onboarding.sideTrailHint", {
            current: String(Math.min(step + 1, stepLabels.length)),
            total: String(stepLabels.length),
            stepName: stepLabels[step] ?? "",
          })}
        </div>
      </div>

      <div
        style={{
          paddingTop: 8,
          borderTop: "1px solid var(--hostly-table-divider-faint)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 4 }}>
            {t("onboarding.sideLastMarked")}
          </div>
          <div style={{ fontSize: 11, fontWeight: 620, lineHeight: 1.38, color: lastMarkedLabel ? "var(--hostly-accent)" : "var(--hostly-ink-muted)" }}>
            {lastMarkedLabel ?? t("onboarding.sideLastMarkedNone")}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 6 }}>
            {t("onboarding.sideTrailEyebrow")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {stepLabels.map((lab, ti) => {
              const cpAtStep = STEP_CHECKPOINT[ti];
              const doneCp = cpAtStep != null && checkpoints[cpAtStep];
              const active = ti === step;
              return (
                <div key={lab} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 18,
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 3,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: doneCp ? "var(--hostly-accent)" : active ? "color-mix(in srgb, var(--hostly-accent) 55%, transparent)" : "var(--hostly-table-divider-faint)",
                        boxShadow: active ? "0 0 0 1px color-mix(in srgb, var(--hostly-accent) 22%, transparent)" : "none",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: active ? 680 : doneCp ? 640 : 580,
                      lineHeight: 1.34,
                      color: active ? "var(--hostly-navy-deep)" : doneCp ? "var(--hostly-accent)" : "color-mix(in srgb, var(--hostly-ink-soft) 88%, transparent)",
                      minWidth: 0,
                    }}
                  >
                    {lab}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 6 }}>
            {t("onboarding.sideBase")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sideChecklist.map((c) => (
              <div
                key={c.key}
                style={{
                  fontSize: 11,
                  fontWeight: 560,
                  lineHeight: 1.35,
                  color: checkpoints[c.key] ? "var(--hostly-accent)" : "color-mix(in srgb, var(--hostly-ink-soft) 75%, transparent)",
                }}
              >
                <span style={{ marginRight: 6, opacity: checkpoints[c.key] ? 1 : 0.35 }}>{checkpoints[c.key] ? "✓" : "·"}</span>
                {c.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {profile.nombre ? (
        <div
          style={{
            marginTop: 2,
            padding: "9px 10px",
            borderRadius: 10,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-table-head-surface)",
            fontSize: 11,
            color: "var(--hostly-ink-muted)",
          }}
        >
          <strong style={{ color: "var(--hostly-ink-strong)", fontWeight: 650 }}>{profile.nombre}</strong>
          <div style={{ marginTop: 3, fontSize: 10 }}>{t(`onboarding.tipo.${profile.tipoNegocio}`)}</div>
        </div>
      ) : null}
      <p className="hostly-muted mb-0 text-[11px] leading-snug">{t("onboarding.sideHint")}</p>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:gap-2.5" style={{ flex: 1 }}>
      {savedHint ? (
        <div
          className="flex shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
          style={{
            border: "1px solid color-mix(in srgb, var(--hostly-accent) 24%, transparent)",
            background: "var(--hostly-success-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {savedHint}
        </div>
      ) : null}
      {renderStepper()}
      <div
        className="grid min-h-0 min-w-0 flex-1 gap-3 max-lg:grid-cols-1 lg:auto-rows-fr lg:grid-cols-[minmax(0,1fr)_minmax(168px,218px)] lg:gap-3 lg:items-start"
      >
        <div
          className="hostly-surface-ice box-border max-lg:max-h-none min-h-0 w-full overflow-y-auto overscroll-contain rounded-[14px] border px-3 py-3 sm:px-5 sm:py-4"
          style={{ borderColor: "var(--hostly-table-divider-soft)", boxShadow: "var(--hostly-shadow-hairline)" }}
        >
          <div key={step} className="hostly-onboarding-pane min-h-0 w-full">
            {panelMain()}
          </div>
        </div>
        <aside className="box-border max-lg:border-t max-lg:border-[var(--hostly-table-divider-soft)] max-lg:pt-3 lg:sticky lg:top-1 lg:self-start lg:rounded-[13px]" data-onboarding-context>
          <div
            className="box-border lg:rounded-[13px]"
            style={{
              border: "1px solid var(--hostly-table-divider-soft)",
              background:
                "color-mix(in srgb, var(--hostly-success-soft) 28%, color-mix(in srgb, var(--hostly-ice-100) 92%, transparent))",
              padding: "8px 10px",
              boxShadow: "var(--hostly-shadow-hairline)",
            }}
          >
            {step === 5 ? (
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--hostly-table-divider-faint)" }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 650,
                    color: "var(--hostly-ink-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.085em",
                    marginBottom: 6,
                  }}
                >
                  {t("onboarding.escSummary")}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--hostly-ink)", lineHeight: 1.5 }}>
                  <div>
                    {t("onboarding.escCoste")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{costeSum.toFixed(2)} €</strong>
                  </div>
                  <div>
                    {t("onboarding.escPvp")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{pvp.toFixed(2)} €</strong>
                  </div>
                  <div>
                    {t("onboarding.escMargin")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{mPct != null ? `${mPct.toFixed(1)}%` : "—"}</strong>
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 650, fontSize: 12, color: marginTierColor(mTier) }}>{t(`onboarding.margin.${mTier}`)}</div>
                </div>
              </div>
            ) : null}
            {sidePanel}
          </div>
        </aside>
      </div>
    </div>
  );
}

function marginTierColor(tier: string): string {
  switch (tier) {
    case "excelente":
      return "var(--hostly-accent)";
    case "bueno":
      return "color-mix(in srgb, var(--hostly-accent) 65%, var(--hostly-navy-deep))";
    case "ajustado":
      return "#b45309";
    case "peligro":
      return "#b42318";
    default:
      return "var(--hostly-ink-muted)";
  }
}
