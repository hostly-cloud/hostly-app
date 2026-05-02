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

const inp: CSSProperties = {
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "rgba(15, 23, 42, 0.88)",
  color: "#f1f5f9",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
  minHeight: 48,
};

const lbl: CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.04em" };

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

  const sideChecklist: { key: OnboardingCheckpointKey; label: string }[] = [
    { key: "negocio", label: t("onboarding.chkNegocio") },
    { key: "carta", label: t("onboarding.chkCarta") },
    { key: "catalogo", label: t("onboarding.chkCatalogo") },
    { key: "inventario", label: t("onboarding.chkInventario") },
    { key: "usuarios", label: t("onboarding.chkUsuarios") },
    { key: "escandallo", label: t("onboarding.chkEscandallo") },
  ];

  const renderStepper = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
      {stepLabels.map((label, i) => {
        const active = i === step;
        const cpKey = STEP_CHECKPOINT[i];
        const stepDone = cpKey != null && checkpoints[cpKey];
        const isPast = i < step;
        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (i <= step) setStep(i);
            }}
            style={{
              border: active
                ? "1px solid rgba(251, 191, 36, 0.55)"
                : stepDone || isPast
                  ? "1px solid rgba(52, 211, 153, 0.35)"
                  : "1px solid rgba(51, 65, 85, 0.6)",
              background: active
                ? "linear-gradient(180deg, rgba(69, 26, 3, 0.5) 0%, rgba(30, 41, 59, 0.9) 100%)"
                : stepDone || isPast
                  ? "rgba(6, 78, 59, 0.2)"
                  : "rgba(15, 23, 42, 0.65)",
              color: active ? "#fef3c7" : stepDone || isPast ? "#a7f3d0" : "#94a3b8",
              padding: "7px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              cursor: i <= step ? "pointer" : "default",
              opacity: i <= step ? 1 : 0.55,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ opacity: 0.85, marginRight: 6 }}>{i + 1}</span>
            {label}
          </button>
        );
      })}
    </div>
  );

  const panelMain = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.negocioTitle")}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{t("onboarding.negocioSub")}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
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
              style={{
                alignSelf: "flex-start",
                border: "none",
                background: profile.nombre.trim() ? "linear-gradient(180deg, rgba(251,191,36,0.95) 0%, rgba(217,119,6,0.9) 100%)" : "rgba(71,85,105,0.4)",
                color: profile.nombre.trim() ? "#1c1917" : "#64748b",
                padding: "12px 22px",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 14,
                cursor: profile.nombre.trim() ? "pointer" : "not-allowed",
                marginTop: 4,
              }}
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
                <button type="button" onClick={() => router.push("/dashboard/carta")} style={{ ...inp, width: "auto", cursor: "pointer", minHeight: 42, fontSize: 13 }}>
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
                  style={{
                    border: "1px solid rgba(71,85,105,0.55)",
                    background: "transparent",
                    color: "#94a3b8",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    minHeight: 42,
                    fontSize: 13,
                  }}
                >
                  {t("onboarding.cartaSkip")}
                </button>
              </>
            }
          />
        );
      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.catalogTitle")}</h2>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>
                {t("onboarding.catalogCount", { n: String(catalogDraft.length) })}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["all", "plato", "bebida"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCatFilter(f)}
                  style={{
                    border: catFilter === f ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(51,65,85,0.6)",
                    background: catFilter === f ? "rgba(69,26,3,0.35)" : "transparent",
                    color: catFilter === f ? "#fde68a" : "#94a3b8",
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {f === "all" ? t("onboarding.filterAll") : t(TIPO_KEYS[f])}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 180, overflow: "auto", borderRadius: 10, border: "1px solid rgba(51,65,85,0.55)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px minmax(100px,1.2fr) minmax(80px,0.7fr) minmax(72px,0.55fr) minmax(56px,0.4fr)",
                  gap: 6,
                  padding: "8px 10px",
                  borderBottom: "1px solid rgba(51,65,85,0.45)",
                  position: "sticky",
                  top: 0,
                  background: "rgba(30,41,59,0.95)",
                  fontSize: 9,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                <span />
                <span>{t("carta.colNombre")}</span>
                <span>{t("carta.colTipo")}</span>
                <span>{t("carta.colCategoria")}</span>
                <span style={{ textAlign: "right" }}>{t("carta.colPrecio")}</span>
              </div>
              {filteredCatalog.map((r) => (
                <div
                  key={r.tempId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px minmax(100px,1.2fr) minmax(80px,0.7fr) minmax(72px,0.55fr) minmax(56px,0.4fr)",
                    gap: 6,
                    padding: "6px 10px",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(51,65,85,0.25)",
                  }}
                >
                  <input type="checkbox" checked={r.selected} onChange={() => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, selected: !x.selected } : x)))} style={{ width: 18, height: 18 }} />
                  <input style={{ ...inp, minHeight: 40, padding: "8px 10px", fontSize: 13 }} value={r.nombre} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, nombre: e.target.value } : x)))} />
                  <select style={{ ...inp, minHeight: 40, padding: "8px", fontSize: 12, cursor: "pointer" }} value={r.tipoVenta} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, tipoVenta: e.target.value as TipoProductoVenta } : x)))}>
                    {TIPOS_PRODUCTO_VENTA.map((tv) => (
                      <option key={tv} value={tv}>
                        {t(TIPO_KEYS[tv])}
                      </option>
                    ))}
                  </select>
                  <input style={{ ...inp, minHeight: 40, padding: "8px", fontSize: 12 }} value={r.categoria} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, categoria: e.target.value } : x)))} />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    style={{ ...inp, minHeight: 40, padding: "8px", fontSize: 13, textAlign: "right" }}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                onClick={() => void createCatalog()}
                style={{
                  border: "none",
                  background: "linear-gradient(180deg, rgba(34,197,94,0.35) 0%, rgba(21,128,61,0.25) 100%)",
                  color: "#dcfce7",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "rgba(34,197,94,0.5)",
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {t("onboarding.ctaCreateCatalog")}
              </button>
              <button type="button" onClick={() => setStep(1)} style={{ border: "1px solid rgba(71,85,105,0.55)", background: "transparent", color: "#94a3b8", padding: "10px 16px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          </div>
        );
      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.stockTitle")}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("onboarding.stockSub")}</p>
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
                    border: "1px solid rgba(51,65,85,0.55)",
                    background: "rgba(15,23,42,0.5)",
                    color: "#cbd5e1",
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + {s.nombre}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={addSuggested} style={{ border: "1px solid rgba(56,189,248,0.35)", background: "rgba(8,47,73,0.3)", color: "#bae6fd", padding: "8px 14px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                {t("onboarding.stockAddSuggested")}
              </button>
              <button type="button" onClick={addManualStock} style={{ border: "1px solid rgba(71,85,105,0.55)", background: "transparent", color: "#94a3b8", padding: "8px 14px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>
                {t("onboarding.stockAddManual")}
              </button>
            </div>
            <div style={{ overflow: "auto", maxHeight: 280, border: "1px solid rgba(51,65,85,0.55)", borderRadius: 10 }}>
              {stockRows
                .filter((r) => normalizeName(r.nombre).includes(normalizeName(stockSearch)) || !stockSearch.trim())
                .map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 88px 100px 100px", gap: 8, padding: "8px 10px", borderBottom: "1px solid rgba(51,65,85,0.3)", alignItems: "center" }}>
                    <input style={{ ...inp, minHeight: 40 }} value={r.nombre} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, nombre: e.target.value } : x)))} />
                    <select style={{ ...inp, minHeight: 40, cursor: "pointer" }} value={r.unidad} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unidad: e.target.value as UnidadStock } : x)))}>
                      {UNIDADES_STOCK.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input type="number" style={{ ...inp, minHeight: 40 }} value={r.stock_actual} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_actual: Number(e.target.value) || 0 } : x)))} />
                    <input type="number" style={{ ...inp, minHeight: 40 }} value={r.stock_minimo} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_minimo: Number(e.target.value) || 0 } : x)))} />
                  </div>
                ))}
            </div>
            <button type="button" onClick={saveInventario} style={{ alignSelf: "flex-start", border: "none", background: "linear-gradient(180deg, rgba(251,191,36,0.95) 0%, rgba(217,119,6,0.9) 100%)", color: "#1c1917", padding: "12px 22px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
              {t("onboarding.ctaSaveStock")}
            </button>
          </div>
        );
      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.usersTitle")}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("onboarding.usersSub")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
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
              <button type="button" onClick={addUser} style={{ border: "1px solid rgba(167,139,250,0.45)", background: "rgba(88,28,135,0.25)", color: "#e9d5ff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                {t("onboarding.ctaAddUser")}
              </button>
              <button type="button" onClick={continueUsers} style={{ border: "none", background: "linear-gradient(180deg, rgba(34,197,94,0.32) 0%, rgba(21,128,61,0.2) 100%)", color: "#bbf7d0", borderWidth: 1, borderStyle: "solid", borderColor: "rgba(34,197,94,0.45)", padding: "10px 18px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                {t("onboarding.ctaUsersContinue")}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{t("onboarding.usersRolesHint")}</p>
            <div style={{ overflow: "auto", maxHeight: 220, border: "1px solid rgba(51,65,85,0.55)", borderRadius: 10 }}>
              {usersList.map((u) => (
                <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 8, padding: "8px 10px", borderBottom: "1px solid rgba(51,65,85,0.3)", fontSize: 12, color: "#e2e8f0" }}>
                  <span>{u.nombre}</span>
                  <span style={{ color: "#94a3b8" }}>{u.email}</span>
                  <span style={{ fontWeight: 700 }}>{t(`onboarding.rol.${u.rol}`)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 5:
        if (platos.length === 0) {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.escTitle")}</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{t("onboarding.escNoPlatos")}</p>
              <button type="button" onClick={() => setStep(2)} style={{ alignSelf: "flex-start", border: "1px solid rgba(251,191,36,0.45)", color: "#fde68a", background: "rgba(69,26,3,0.35)", padding: "10px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>{t("onboarding.escTitle")}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("onboarding.escSub")}</p>
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
            <button type="button" onClick={addEscLine} style={{ alignSelf: "flex-start", border: "1px solid rgba(71,85,105,0.55)", background: "transparent", color: "#94a3b8", padding: "8px 12px", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
              + {t("onboarding.escAddLine")}
            </button>
            <div style={{ overflow: "auto", maxHeight: 200, border: "1px solid rgba(51,65,85,0.55)", borderRadius: 10 }}>
              {escLines.map((ln) => {
                const st = loadStock();
                return (
                  <div key={ln.id} style={{ display: "grid", gridTemplateColumns: "1fr 72px 88px", gap: 8, padding: "8px 10px", borderBottom: "1px solid rgba(51,65,85,0.3)", alignItems: "center" }}>
                    <select style={{ ...inp, minHeight: 40, cursor: "pointer" }} value={ln.stockId} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, stockId: e.target.value } : x)))}>
                      {st.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                    <input style={{ ...inp, minHeight: 40 }} value={ln.cantidad} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, cantidad: e.target.value } : x)))} />
                    <input style={{ ...inp, minHeight: 40 }} value={ln.costeLinea} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, costeLinea: e.target.value } : x)))} placeholder="€" />
                  </div>
                );
              })}
            </div>
            {escErr ? <div style={{ color: "#fecaca", fontSize: 12 }}>{escErr}</div> : null}
            <button
              type="button"
              disabled={escSaving || !escPlatoId || platos.length === 0}
              onClick={saveEscandallo}
              style={{
                alignSelf: "flex-start",
                border: "none",
                background: escSaving ? "rgba(71,85,105,0.5)" : "linear-gradient(180deg, rgba(251,191,36,0.95) 0%, rgba(217,119,6,0.9) 100%)",
                color: "#1c1917",
                padding: "12px 22px",
                borderRadius: 10,
                fontWeight: 800,
                cursor: escSaving ? "wait" : "pointer",
              }}
            >
              {escSaving ? "…" : t("onboarding.ctaSaveEsc")}
            </button>
          </div>
        );
      case 6:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#a7f3d0" }}>{t("onboarding.doneTitle")}</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{t("onboarding.doneSub")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: t("onboarding.statCatalog"), value: String(loadPlatos(rid).length) },
                { label: t("onboarding.statStock"), value: String(loadStock().length) },
                { label: t("onboarding.statUsers"), value: String(loadUsuarios().length) },
                { label: t("onboarding.statEsc"), value: checkpoints.escandallo ? "✓" : "—" },
              ].map((x) => (
                <div key={x.label} style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(52,211,153,0.25)", background: "rgba(6,78,59,0.15)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>{x.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", marginTop: 4 }}>{x.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sideChecklist.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: checkpoints[c.key] ? "#a7f3d0" : "#64748b" }}>
                  <span>{checkpoints[c.key] ? "✓" : "○"}</span>
                  {c.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={() => router.push("/dashboard")} style={{ border: "none", background: "linear-gradient(180deg, rgba(34,197,94,0.4) 0%, rgba(21,128,61,0.3) 100%)", color: "#dcfce7", padding: "14px 26px", borderRadius: 11, fontWeight: 800, fontSize: 15, cursor: "pointer", borderWidth: 1, borderStyle: "solid", borderColor: "rgba(34,197,94,0.5)" }}>
                {t("onboarding.ctaEnterDashboard")}
              </button>
              <Link href="/dashboard/carta" style={{ display: "inline-flex", alignItems: "center", border: "1px solid rgba(71,85,105,0.55)", color: "#94a3b8", padding: "12px 18px", borderRadius: 10, fontWeight: 600, textDecoration: "none" }}>
                {t("onboarding.ctaReviewCarta")}
              </Link>
              <Link href="/dashboard/stock" style={{ display: "inline-flex", alignItems: "center", border: "1px solid rgba(71,85,105,0.55)", color: "#94a3b8", padding: "12px 18px", borderRadius: 10, fontWeight: 600, textDecoration: "none" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("onboarding.sideProgress")}</div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(51,65,85,0.5)", overflow: "hidden" }}>
        <div style={{ width: `${activationPct}%`, height: "100%", background: "linear-gradient(90deg, rgba(52,211,153,0.9), rgba(34,197,94,0.7))", transition: "width 0.35s ease" }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>{activationPct}%</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 8 }}>{t("onboarding.sideBase")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sideChecklist.map((c) => (
          <div key={c.key} style={{ fontSize: 12, color: checkpoints[c.key] ? "#86efac" : "#525c6c" }}>
            {checkpoints[c.key] ? "✓ " : "· "}
            {c.label}
          </div>
        ))}
      </div>
      {profile.nombre ? (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid rgba(51,65,85,0.5)", background: "rgba(15,23,42,0.5)", fontSize: 12, color: "#94a3b8" }}>
          <strong style={{ color: "#e2e8f0" }}>{profile.nombre}</strong>
          <div style={{ marginTop: 4 }}>{t(`onboarding.tipo.${profile.tipoNegocio}`)}</div>
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{t("onboarding.sideHint")}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
      {savedHint ? (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            borderRadius: 9,
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.28)",
            color: "#bbf7d0",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {savedHint}
        </div>
      ) : null}
      {renderStepper()}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            minHeight: 0,
            overflowY: "auto",
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(51, 65, 85, 0.55)",
            background: "linear-gradient(165deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.75) 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {panelMain()}
        </div>
        <div
          style={{
            minHeight: 0,
            overflowY: "auto",
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(51, 65, 85, 0.45)",
            background: "rgba(15, 23, 42, 0.55)",
          }}
        >
          {step === 5 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>{t("onboarding.escSummary")}</div>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
                <div>
                  {t("onboarding.escCoste")}: <strong>{costeSum.toFixed(2)} €</strong>
                </div>
                <div>
                  {t("onboarding.escPvp")}: <strong>{pvp.toFixed(2)} €</strong>
                </div>
                <div>
                  {t("onboarding.escMargin")}: <strong>{mPct != null ? `${mPct.toFixed(1)}%` : "—"}</strong>
                </div>
                <div style={{ marginTop: 8, fontWeight: 800, color: marginTierColor(mTier) }}>{t(`onboarding.margin.${mTier}`)}</div>
              </div>
            </div>
          ) : null}
          {sidePanel}
        </div>
      </div>
    </div>
  );
}

function marginTierColor(tier: string): string {
  switch (tier) {
    case "excelente":
      return "#4ade80";
    case "bueno":
      return "#6ee7b7";
    case "ajustado":
      return "#fbbf24";
    case "peligro":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}
