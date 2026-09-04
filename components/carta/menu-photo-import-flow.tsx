"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import CartaImportPremiumLayout, { CartaImportWizardRail } from "@/components/carta/carta-import-premium-layout";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import {
  applyDefaultModifierFamilyIfEligible,
  fetchModifierFamiliesForRestaurante,
  findCartaCategoriaByNameLoose,
} from "@/lib/modificadores/default-modifier-family";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { extractMenuFromUpload, MenuImportExtractError, MenuImportNoProductsError } from "@/lib/carta/extract-menu-from-upload";
import {
  TIPOS_PRODUCTO_VENTA,
  createPlatoDraft,
  inferTipoVentaFromCartaText,
  loadPlatos,
  parseTipoVentaLoose,
  savePlatos,
  type PlatoCarta,
  type TipoProductoVenta,
} from "@/lib/platos-local";

type Step = "upload" | "analyzing" | "review" | "publish" | "done";

type AnalyzePhase = 0 | 1 | 2 | 3 | 4;

type ReviewSeverity = "ok" | "review" | "error";

const TIPO_KEYS: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

const cellInp: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "rgba(15, 23, 42, 0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  boxSizing: "border-box",
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    const s = value.trim();
    return s ? [s] : [];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asPotentialDuplicates(value: unknown): ExtractedMenuRow["potentialDuplicates"] {
  if (!Array.isArray(value)) return [];
  const out: NonNullable<ExtractedMenuRow["potentialDuplicates"]> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = asRecord(raw);
    const platoId = typeof r.platoId === "string" ? r.platoId : typeof r.id === "string" ? r.id : null;
    if (!platoId) continue;
    const score = typeof r.score === "number" && Number.isFinite(r.score) ? Math.max(0, Math.min(1, r.score)) : 0;
    const reasons = Array.isArray(r.reasons)
      ? r.reasons.filter((x): x is string => typeof x === "string")
      : [];
    out.push({ platoId, score, reasons });
  }
  return out;
}

function normalizeImportedRow(raw: unknown): ExtractedMenuRow {
  const r = asRecord(raw);

  // Compatibilidad con nombres legacy/externos.
  const legacyCandidates = r.duplicateCandidates ?? r.duplicate_candidates ?? null;
  const legacyDecision = r.duplicateDecision ?? r.duplicate_decision ?? null;
  const legacyTargetId = r.duplicateTargetId ?? r.duplicate_target_id ?? null;
  const legacyWarnings = r.warnings ?? r.warn ?? null;

  const tempId = typeof r.tempId === "string" && r.tempId ? r.tempId : `norm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
  const categoria = typeof r.categoria === "string" ? r.categoria.trim() : typeof r.category === "string" ? r.category.trim() : "";
  const precioRaw = r.precio ?? r.price;
  const precioNum = typeof precioRaw === "number" ? precioRaw : typeof precioRaw === "string" ? Number(precioRaw.replace(",", ".")) : NaN;
  const precio = Number.isFinite(precioNum) ? Math.round(precioNum * 100) / 100 : NaN;
  const tipoVenta =
    parseTipoVentaLoose(r.tipoVenta) ??
    inferTipoVentaFromCartaText(categoria || "General", nombre || "Producto");
  const selected = typeof r.selected === "boolean" ? r.selected : true;

  const actionRaw = r.action ?? legacyDecision;
  const action =
    actionRaw === "create_new" ||
    actionRaw === "use_existing" ||
    actionRaw === "update_existing" ||
    actionRaw === "ignore" ||
    actionRaw === "pending_review"
      ? actionRaw
      : "create_new";

  const targetPlatoId =
    typeof r.targetPlatoId === "string"
      ? r.targetPlatoId
      : typeof legacyTargetId === "string"
        ? legacyTargetId
        : null;

  const potentialDuplicates = asPotentialDuplicates(r.potentialDuplicates ?? legacyCandidates);
  const issues = Array.isArray(r.issues)
    ? r.issues.filter(
        (x): x is "duplicate" | "price_suspicious" =>
          x === "duplicate" || x === "price_suspicious",
      )
    : [];
  const iaNotes = asStringArray(r.iaNotes ?? legacyWarnings ?? r.notes ?? null);

  const categoryLowConfidence = typeof r.categoryLowConfidence === "boolean" ? r.categoryLowConfidence : false;
  const familia = typeof r.familia === "string" ? r.familia : "";
  const disponible = typeof r.disponible === "boolean" ? r.disponible : true;

  return {
    tempId,
    nombre: nombre || "Producto",
    categoria: categoria || "General",
    precio,
    tipoVenta,
    selected: action === "ignore" ? false : selected,
    action,
    targetPlatoId,
    potentialDuplicates,
    issues,
    categoryLowConfidence,
    familia,
    iaNotes,
    disponible,
  };
}

export default function MenuPhotoImportFlow() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const autoStartOnPickRef = useRef(false);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<ExtractedMenuRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [linkedCount, setLinkedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingCostCount, setPendingCostCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [procBusy, setProcBusy] = useState(false);
  const [iaPhase, setIaPhase] = useState(0);
  const [busyProgress, setBusyProgress] = useState(0);
  const [anPhase, setAnPhase] = useState<AnalyzePhase>(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "plato" | "bebida" | "alerts">("all");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelDraft, setPanelDraft] = useState<{
    nombre: string;
    precio: string;
    categoria: string;
    tipoVenta: TipoProductoVenta;
    familia: string;
    disponible: boolean;
  } | null>(null);

  useEffect(() => {
    if (!procBusy) {
      setIaPhase(0);
      setBusyProgress(0);
      return;
    }
    const id = window.setInterval(() => setIaPhase((p) => (p + 1) % 4), 880);
    return () => window.clearInterval(id);
  }, [procBusy]);

  useEffect(() => {
    if (!procBusy) return;
    // Progreso suave tipo SaaS (demo): sube rápido y se acerca a 92% hasta terminar.
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const target = 0.92;
      const ramp = 1 - Math.exp(-elapsed / 1100);
      const next = Math.min(target, 0.08 + ramp * (target - 0.08));
      setBusyProgress((prev) => (next > prev ? next : prev));
    }, 120);
    return () => window.clearInterval(id);
  }, [procBusy]);

  const clearCartaFile = useCallback(() => {
    setError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
    setRows([]);
    setStep("upload");
    setCreatedCount(0);
    setLinkedCount(0);
    setUpdatedCount(0);
    setIgnoredCount(0);
    setPendingReviewCount(0);
    setPendingCostCount(0);
    setQuery("");
    setFilter("all");
    setOnlyIssues(false);
  }, []);

  const pickFile = useCallback(
    (f: File | null) => {
      setError(null);
      if (!f || (!f.type.startsWith("image/") && f.type !== "application/pdf")) {
        setError(t("cartaImport.errorNoFile"));
        return;
      }
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
      });
      setFile(f);
    },
    [t],
  );

  useEffect(() => {
    if (!file) return;
    if (!autoStartOnPickRef.current) return;
    autoStartOnPickRef.current = false;
    // Deja que el UI aplique el preview 1 tick antes de entrar al análisis.
    window.setTimeout(() => startAnalysis(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const loadExampleMenu = useCallback(async () => {
    setError(null);
    const { createExampleMenuImageFile } = await import("@/lib/carta/example-menu-image");
    const img = await createExampleMenuImageFile(locale === "en" ? "en" : "es");
    pickFile(img);
  }, [locale, pickFile]);

  const startAnalysis = useCallback(async () => {
    console.log("[UI] start import");
    if (!file) {
      setError(t("cartaImport.errorNoFile"));
      return;
    }
    setError(null);
    setStep("analyzing");
    setProcBusy(true); // mantiene animaciones existentes (puntos/label) reutilizables
    setAnPhase(0);
    try {
      const startedAt = Date.now();

      // Fases demo (2.5s–4s total aprox).
      const schedule: Array<{ at: number; phase: AnalyzePhase }> = [
        { at: 0, phase: 0 }, // Archivo preparado
        { at: 520, phase: 1 }, // Lectura del menú
        { at: 1320, phase: 2 }, // Detectando productos
        { at: 2120, phase: 3 }, // Detectando precios
        { at: 2920, phase: 4 }, // Organizando categorías
      ];

      // Avanza fases con timers (sin bloquear).
      const timeouts: number[] = [];
      for (const s of schedule) {
        timeouts.push(window.setTimeout(() => setAnPhase(s.phase), s.at));
      }

      console.log("[UI] sending POST /api/ai/import-menu");
      const { rows: out } = await extractMenuFromUpload(file);

      const minTotal = 2800;
      const maxTotal = 3800;
      const target = minTotal + Math.round(Math.random() * (maxTotal - minTotal));
      const elapsed = Date.now() - startedAt;
      if (elapsed < target) {
        await new Promise<void>((r) => window.setTimeout(r, target - elapsed));
      }

      for (const id of timeouts) window.clearTimeout(id);
      setRows(out.map(normalizeImportedRow));
      setStep("review");
    } catch (e) {
      if (e instanceof MenuImportNoProductsError) {
        setError(t("cartaImport.noProductsDetectedTitle"));
      } else {
        setError(
          e instanceof MenuImportExtractError ? e.message : String((e as Error)?.message ?? t("cartaImport.errorExtract")),
        );
      }
      setStep("upload");
    } finally {
      setBusyProgress(1);
      window.setTimeout(() => setBusyProgress(0), 450);
      setProcBusy(false);
    }
  }, [file, t]);

  // (movido más abajo) auto-abrir primer producto en revisión

  const setAllSelected = useCallback((v: boolean) => {
    setRows((prev) => prev.map(normalizeImportedRow).map((r) => normalizeImportedRow({ ...r, selected: v })));
  }, []);

  const updateRow = useCallback((tempId: string, patch: Partial<ExtractedMenuRow>) => {
    setRows((prev) =>
      prev
        .map(normalizeImportedRow)
        .map((r) => (r.tempId === tempId ? normalizeImportedRow({ ...r, ...patch }) : r)),
    );
  }, []);

  const openRow = useCallback(
    (tempId: string) => {
      const r = rows.find((x) => x.tempId === tempId);
      if (!r) return;
      setActiveId(tempId);
      setPanelDraft({
        nombre: r.nombre ?? "",
        precio: Number.isFinite(r.precio) ? String(r.precio) : "",
        categoria: r.categoria ?? "",
        tipoVenta: r.tipoVenta,
        familia: (r.familia ?? "").trim(),
        disponible: r.disponible !== false,
      });
    },
    [rows],
  );

  const closePanel = useCallback(() => {
    setActiveId(null);
    setPanelDraft(null);
  }, []);

  // Robustez: si cambia la lista (reanalyze / filtros / quitar archivo), evita panel colgando.
  useEffect(() => {
    if (!activeId) return;
    const r = rows.find((x) => x.tempId === activeId);
    if (!r) {
      closePanel();
      return;
    }
    // Si existe item activo pero el draft está vacío (edge), rehidrata.
    if (!panelDraft) {
      setPanelDraft({
        nombre: r.nombre ?? "",
        precio: Number.isFinite(r.precio) ? String(r.precio) : "",
        categoria: r.categoria ?? "",
        tipoVenta: r.tipoVenta,
        familia: (r.familia ?? "").trim(),
        disponible: r.disponible !== false,
      });
    }
  }, [activeId, rows, panelDraft, closePanel]);

  const confirmCreate = useCallback(async () => {
    setError(null);
    const selected = rows.filter((r) => r.selected);
    const ignored = rows.filter((r) => (r.action ?? "create_new") === "ignore" || !r.selected);
    const pending = selected.filter((r) => (r.action ?? "create_new") === "pending_review");
    const validSelected = selected.filter(
      (r) =>
        (r.action ?? "create_new") !== "ignore" &&
        (r.action ?? "create_new") !== "pending_review" &&
        r.nombre.trim() &&
        Number.isFinite(r.precio) &&
        r.precio >= 0,
    );
    if (validSelected.length === 0) {
      setError(t("cartaImport.errorNoneSelected"));
      return;
    }
    setCreating(true);
    try {
      const rid = getBrowserRestauranteId();
      const [cartaCats, cartaFams, modifierFamilies] = await Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
      ]);
      const famByMenuId = new Map(cartaFams.map((f) => [f.id, f] as const));
      const next = [...loadPlatos(rid)];
      let created = 0;
      let linked = 0;
      let updated = 0;
      const ignoredCount = ignored.length;
      const pendingCount = pending.length;
      for (const r of validSelected) {
        const action = r.action ?? "create_new";
        const targetId = r.targetPlatoId ?? null;
        if ((action === "use_existing" || action === "update_existing") && !targetId) {
          // Fallback seguro: si no hay target, no hacemos nada destructivo; crea nuevo.
          // (mantiene el flujo funcionando incluso si el usuario no eligió correctamente)
        }

        if (action === "use_existing" && targetId) {
          linked += 1;
          continue;
        }

        if (action === "update_existing" && targetId) {
          const idx = next.findIndex((p) => p.id === targetId);
          if (idx >= 0) {
            const prev = next[idx];
            const now = new Date().toISOString();
            const byRow = findCartaCategoriaByNameLoose(cartaCats, r.categoria.trim());
            const catMatch =
              byRow ?? (prev.categoriaCartaId ? cartaCats.find((c) => c.id === prev.categoriaCartaId) : undefined);
            const menuName =
              catMatch?.cartaFamiliaId != null ? famByMenuId.get(catMatch.cartaFamiliaId)?.name : undefined;
            let merged: PlatoCarta = {
              ...prev,
              // Solo actualiza campos de venta; no toca inventario/stock.
              nombre: r.nombre.trim() || prev.nombre,
              categoria: r.categoria.trim() || prev.categoria,
              precioVenta: r.precio,
              tipoVenta: r.tipoVenta,
              updatedAt: now,
            };
            merged = applyDefaultModifierFamilyIfEligible(merged, {
              selectedCartaCategoria: catMatch,
              cartaMenuFamiliaName: menuName,
              modifierFamilies,
            });
            next[idx] = merged;
            updated += 1;
            continue;
          }
          // Si el target no existe, crea nuevo (fallback).
        }

        const catNew = findCartaCategoriaByNameLoose(cartaCats, r.categoria.trim() || "General");
        const menuNameNew =
          catNew?.cartaFamiliaId != null ? famByMenuId.get(catNew.cartaFamiliaId)?.name : undefined;
        let plato = createPlatoDraft(rid, {
          nombre: r.nombre.trim(),
          categoria: catNew?.name ?? (r.categoria.trim() || "General"),
          categoriaCartaId: catNew?.id,
          cartaFamiliaId: catNew?.cartaFamiliaId?.trim() || undefined,
          precioVenta: r.precio,
          tipoVenta: r.tipoVenta,
          activo: true,
        });
        plato = applyDefaultModifierFamilyIfEligible(plato, {
          selectedCartaCategoria: catNew,
          cartaMenuFamiliaName: menuNameNew,
          modifierFamilies,
        });
        // Marcar alta desde importación IA + estado coste pendiente (sin escandallo).
        plato.origenAlta = "importacion_ia";
        plato.tieneEscandallo = false;
        plato.estadoCoste = "pendiente";
        plato.escandalloSupabaseId = null;
        next.push(plato);
        created += 1;
      }
      savePlatos(rid, next);
      setCreatedCount(created);
      setLinkedCount(linked);
      setUpdatedCount(updated);
      setPendingCostCount(created); // todo lo creado nuevo entra sin escandallo
      setIgnoredCount(ignoredCount);
      setPendingReviewCount(pendingCount);
      setStep("done");
    } catch {
      setError(t("cartaImport.errorCreate"));
    } finally {
      setCreating(false);
    }
  }, [rows, t]);

  useEffect(() => {
    if (step !== "done") return;
    const id = window.setTimeout(() => {
      router.push("/dashboard/operacion/tpv");
    }, 3200);
    return () => window.clearTimeout(id);
  }, [step, router]);

  const duplicateCount = useMemo(() => rows.filter((r) => r.issues?.includes("duplicate")).length, [rows]);
  const suspiciousCount = useMemo(() => rows.filter((r) => r.issues?.includes("price_suspicious")).length, [rows]);
  const missingPriceCount = useMemo(() => rows.filter((r) => !Number.isFinite(r.precio)).length, [rows]);
  const lowConfCategoryCount = useMemo(() => rows.filter((r) => r.categoryLowConfidence).length, [rows]);
  const incompleteNameCount = useMemo(() => rows.filter((r) => r.nombre.trim().length < 3 || r.nombre.includes("…")).length, [rows]);
  const toReviewCount = useMemo(() => {
    return rows.filter((r) => Boolean(r.issues?.length) || !r.nombre.trim() || !Number.isFinite(r.precio) || r.precio < 0).length;
  }, [rows]);

  const categoriesCount = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.categoria ?? "").trim();
      if (c) set.add(c);
    }
    return set.size;
  }, [rows]);

  const analyzedFileLabel = useMemo(() => {
    if (!file) return null;
    const kind = file.type === "application/pdf" ? "PDF" : file.type.startsWith("image/") ? "IMG" : "FILE";
    return `${kind} · ${file.name}`;
  }, [file]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ =
        !q ||
        r.nombre.toLowerCase().includes(q) ||
        r.categoria.toLowerCase().includes(q) ||
        String(r.precio).includes(q);
      const hasAlerts = Boolean(r.issues?.length) || !Number.isFinite(r.precio) || r.categoryLowConfidence || r.nombre.includes("…");
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "alerts"
            ? hasAlerts
            : r.tipoVenta === filter;
      if (onlyIssues && !hasAlerts) return false;
      return matchesQ && matchesFilter;
    });
  }, [rows, query, filter, onlyIssues]);

  // Demo real: al entrar en revisión, abre automáticamente el primer producto.
  useEffect(() => {
    if (step !== "review") return;
    if (activeId) return;
    if (filteredRows.length === 0) return;
    const id = window.setTimeout(() => {
      const first = filteredRows[0]?.tempId ?? null;
      if (first) openRow(first);
    }, 0);
    return () => window.clearTimeout(id);
  }, [step, activeId, filteredRows, openRow]);

  const savePanel = useCallback(
    (opts?: { goNext?: boolean }) => {
      if (!activeId || !panelDraft) return;
      const priceNum = Number(panelDraft.precio.replace(",", "."));
      const nextPrecio = Number.isFinite(priceNum) && priceNum >= 0 ? Math.round(priceNum * 100) / 100 : NaN;
      const current = rows.find((r) => r.tempId === activeId) ?? null;
      const currentAction = current?.action ?? "create_new";
      const autoResolvePending = currentAction === "pending_review" && panelDraft.nombre.trim() && Number.isFinite(nextPrecio);
      updateRow(activeId, {
        nombre: panelDraft.nombre,
        categoria: panelDraft.categoria,
        tipoVenta: panelDraft.tipoVenta,
        familia: panelDraft.familia.trim() || undefined,
        disponible: panelDraft.disponible,
        precio: nextPrecio,
        ...(autoResolvePending ? { action: "create_new" as const } : null),
      });
      if (!opts?.goNext) return;
      const idx = filteredRows.findIndex((r) => r.tempId === activeId);
      const next = idx >= 0 ? filteredRows[idx + 1]?.tempId ?? null : filteredRows[0]?.tempId ?? null;
      if (next) openRow(next);
      else {
        closePanel();
        setStep("publish");
      }
    },
    [activeId, panelDraft, updateRow, filteredRows, openRow, closePanel, setStep, rows],
  );

  const applyToFamily = useCallback(() => {
    if (!activeId || !panelDraft) return;
    const family = panelDraft.familia.trim();
    if (!family) return;
    setRows((prev) =>
      prev.map((r) => {
        if ((r.familia ?? "").trim() !== family) return r;
        return {
          ...r,
          categoria: panelDraft.categoria,
          tipoVenta: panelDraft.tipoVenta,
          disponible: panelDraft.disponible,
          familia: family,
        };
      }),
    );
  }, [activeId, panelDraft]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedMenuRow[]>();
    for (const r of filteredRows) {
      const key = (r.categoria ?? "").trim() || t("cartaImport.uncategorized");
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    // Orden estable por nombre de categoría.
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return keys.map((k) => ({ categoria: k, rows: map.get(k) ?? [] }));
  }, [filteredRows, t]);

  const getSeverity = useCallback((r: ExtractedMenuRow): ReviewSeverity => {
    const hasMissingPrice = !Number.isFinite(r.precio);
    const isDup = Boolean(r.issues?.includes("duplicate"));
    if (hasMissingPrice || isDup) return "error";
    if (r.issues?.includes("price_suspicious") || r.categoryLowConfidence || r.nombre.includes("…") || r.nombre.trim().length < 3) return "review";
    return "ok";
  }, []);

  const saveDraft = useCallback(() => {
    // Demo: persistencia mínima para enseñar “producto real”.
    try {
      const payload = { at: Date.now(), rows, fileName: file?.name ?? null };
      localStorage.setItem("hostly:cartaImportDraft:v1", JSON.stringify(payload));
      setDraftSavedAt(payload.at);
    } catch {
      // ignore
    }
  }, [rows, file]);

  const typeCounts = useMemo(() => {
    const out = { plato: 0, bebida: 0 };
    for (const r of rows) {
      if (r.tipoVenta === "bebida") out.bebida += 1;
      else out.plato += 1;
    }
    return out;
  }, [rows]);

  const catalogOptions = useMemo(() => {
    // La fase invalida el snapshot local tras crear o actualizar productos.
    void step;
    try {
      const rid = getBrowserRestauranteId();
      return loadPlatos(rid).map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, precioVenta: p.precioVenta }));
    } catch {
      return [];
    }
  }, [step]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1, overflow: "hidden" }}>
      {error ? (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.35)",
            color: "#fecaca",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Paso 3 (review) renderiza su propia cabecera y acciones. */}

      {step === "upload" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CartaImportPremiumLayout
            variant="dashboard"
            compactViewport
            accept="image/*,application/pdf"
            showPdfHint
            file={file}
            previewUrl={previewUrl}
            dragOver={dragOver}
            busy={procBusy}
            busyProgress={busyProgress}
            iaPhaseIndex={iaPhase}
            wizardActiveStep={file || procBusy ? 2 : 1}
            wizardCompletedThrough={file ? 1 : 0}
            fileRef={fileRef}
            onFileInputChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              // Permite re-seleccionar el mismo archivo (el input no dispara change si es el mismo).
              try {
                e.currentTarget.value = "";
              } catch {
                // noop
              }
            }}
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
            onAnalyze={startAnalysis}
            onExample={loadExampleMenu}
            onClearFile={clearCartaFile}
            showHero={false}
          />
        </div>
      ) : null}

      {step === "analyzing" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <CartaImportWizardRail variant="dashboard" activeStep={2} completedThrough={1} compact />
          <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0, overflow: "hidden", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: "1.4 1 520px", minWidth: 320, minHeight: 0, display: "flex", overflow: "hidden" }}>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.92) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 20px 50px rgba(0,0,0,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "14px 16px 12px",
                    borderBottom: "1px solid rgba(51, 65, 85, 0.55)",
                    background: "linear-gradient(90deg, rgba(56,189,248,0.14) 0%, rgba(15,23,42,0) 65%)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#64748b" }}>
                    {t("cartaImport.analyzingEyebrow")}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                    {t("cartaImport.analyzingTitle")}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "#94a3b8", lineHeight: 1.45, maxWidth: 620 }}>
                    {t("cartaImport.analyzingSub")}
                  </div>
                </div>

                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      height: 12,
                      borderRadius: 999,
                      background: "rgba(51,65,85,0.55)",
                      border: "1px solid rgba(71,85,105,0.55)",
                      overflow: "hidden",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                    aria-hidden
                  >
                    <div
                      style={{
                        width: `${Math.round(Math.max(0.04, busyProgress) * 100)}%`,
                        height: "100%",
                        background:
                          "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(56,189,248,0.65) 55%, rgba(52,211,153,0.55) 100%)",
                        boxShadow: "0 0 26px rgba(56,189,248,0.14)",
                        transition: "width 220ms ease",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, minHeight: 0, overflow: "auto" }}>
                    {([
                      { p: 0, label: t("cartaImport.anStep0") },
                      { p: 1, label: t("cartaImport.anStep1") },
                      { p: 2, label: t("cartaImport.anStep2") },
                      { p: 3, label: t("cartaImport.anStep3") },
                      { p: 4, label: t("cartaImport.anStep4") },
                    ] as const).map((s) => {
                      const done = anPhase > s.p;
                      const cur = anPhase === s.p;
                      return (
                        <div
                          key={s.p}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: cur
                              ? "1px solid rgba(251,191,36,0.4)"
                              : done
                                ? "1px solid rgba(52,211,153,0.28)"
                                : "1px solid rgba(51,65,85,0.55)",
                            background: cur
                              ? "linear-gradient(90deg, rgba(69,26,3,0.35) 0%, rgba(15,23,42,0.7) 75%)"
                              : done
                                ? "rgba(6,78,59,0.18)"
                                : "rgba(15,23,42,0.55)",
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 9,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 900,
                              color: done ? "#6ee7b7" : cur ? "#fde68a" : "#64748b",
                              border: done
                                ? "1px solid rgba(52,211,153,0.35)"
                                : cur
                                  ? "1px solid rgba(251,191,36,0.6)"
                                  : "1px solid rgba(71,85,105,0.6)",
                              background: "rgba(2,6,23,0.2)",
                              boxShadow: cur ? "0 0 14px rgba(251,191,36,0.12)" : "none",
                              flexShrink: 0,
                            }}
                            aria-hidden
                          >
                            {done ? "✓" : cur ? "⏳" : "•"}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: done ? "#e2e8f0" : cur ? "#f8fafc" : "#94a3b8" }}>
                              {s.label}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: -2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{t("cartaImport.anFastHint")}</div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: "#bae6fd",
                        border: "1px solid rgba(56,189,248,0.25)",
                        background: "rgba(8,47,73,0.18)",
                        padding: "5px 9px",
                        borderRadius: 999,
                      }}
                    >
                      {t("cartaImport.anNoAutoPublish")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                flex: "0.9 1 320px",
                minWidth: 260,
                maxWidth: 420,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.18), 0 18px 44px rgba(0,0,0,0.32)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                  {t("cartaImport.anRightTitle")}
                </div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    t("cartaImport.anRight1"),
                    t("cartaImport.anRight2"),
                    t("cartaImport.anRight3"),
                    t("cartaImport.anRight4"),
                    t("cartaImport.anRight5"),
                  ].map((line) => (
                    <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, background: "rgba(56,189,248,0.55)" }} aria-hidden />
                      <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 650, lineHeight: 1.4 }}>{line}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>{t("cartaImport.anRightNote")}</div>
              </div>

              <button
                type="button"
                onClick={clearCartaFile}
                style={{
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "rgba(15,23,42,0.35)",
                  color: "#cbd5e1",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("cartaImport.backToUpload")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <CartaImportWizardRail variant="dashboard" activeStep={3} completedThrough={2} compact />
          <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0, overflow: "hidden", alignItems: "stretch", flexWrap: "nowrap" }}>
            <div style={{ flex: "1.55 1 700px", minWidth: 360, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(51, 65, 85, 0.6)",
                  background: "linear-gradient(135deg, rgba(30,41,59,0.55) 0%, rgba(15,23,42,0.45) 100%)",
                  padding: "12px 12px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontSize: 18, fontWeight: 950, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                      {t("cartaImport.reviewTopTitle")}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 650, color: "#94a3b8", lineHeight: 1.45, maxWidth: 680 }}>
                      {t("cartaImport.reviewTopSub")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(56,189,248,0.25)",
                        background: "rgba(8,47,73,0.25)",
                        color: "#bae6fd",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {t("cartaImport.reviewDetectedCount", { count: String(rows.length) })}
                    </div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(251,191,36,0.28)",
                        background: "rgba(69,26,3,0.22)",
                        color: "#fde68a",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {t("cartaImport.reviewToReviewCount", { count: String(toReviewCount) })}
                    </div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(251,191,36,0.28)",
                        background: "rgba(69,26,3,0.22)",
                        color: "#fde68a",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {t("cartaImport.reviewCategoriesCount", { count: String(categoriesCount) })}
                    </div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(248,113,113,0.28)",
                        background: "rgba(127,29,29,0.18)",
                        color: "#fecaca",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {t("cartaImport.reviewSuspiciousPrices", { count: String(suspiciousCount) })}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>{t("cartaImport.reviewTrust")}</span>
                    {analyzedFileLabel ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "4px 9px",
                          borderRadius: 999,
                          border: "1px solid rgba(56,189,248,0.25)",
                          background: "rgba(8,47,73,0.18)",
                          color: "#7dd3fc",
                        }}
                      >
                        {analyzedFileLabel}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("cartaImport.searchPlaceholder")}
                      style={{
                        width: 220,
                        maxWidth: "100%",
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(71,85,105,0.55)",
                        background: "rgba(15,23,42,0.7)",
                        color: "#e2e8f0",
                        fontSize: 12,
                        fontWeight: 650,
                        outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(
                        [
                          { id: "all", label: t("cartaImport.filterAll") },
                          { id: "plato", label: t("cartaImport.filterPlates") },
                          { id: "bebida", label: t("cartaImport.filterDrinks") },
                          { id: "alerts", label: t("cartaImport.filterAlerts") },
                        ] as const
                      ).map((opt) => {
                        const active = filter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setFilter(opt.id)}
                            style={{
                              border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(71,85,105,0.55)",
                              background: active ? "rgba(8,47,73,0.35)" : "transparent",
                              color: active ? "#bae6fd" : "#94a3b8",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAllSelected(true)}
                      style={{
                        border: "1px solid rgba(71, 85, 105, 0.55)",
                        background: "transparent",
                        color: "#94a3b8",
                        padding: "6px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {t("cartaImport.selectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllSelected(false)}
                      style={{
                        border: "1px solid rgba(71, 85, 105, 0.55)",
                        background: "transparent",
                        color: "#94a3b8",
                        padding: "6px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {t("cartaImport.deselectAll")}
                    </button>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(71,85,105,0.55)",
                        color: "#94a3b8",
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
                      {t("cartaImport.onlyIssues")}
                    </label>
                    <button
                      type="button"
                      onClick={() => startAnalysis()}
                      style={{
                        border: "1px solid rgba(251,191,36,0.28)",
                        background: "rgba(69,26,3,0.18)",
                        color: "#fde68a",
                        padding: "6px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                      title={t("cartaImport.reanalyzeHint")}
                    >
                      {t("cartaImport.reanalyze")}
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  borderRadius: 16,
                  border: "1px solid rgba(51, 65, 85, 0.6)",
                  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.35) 0%, rgba(2,6,23,0.25) 100%)",
                  padding: 10,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {grouped.length === 0 ? (
                    <div
                      style={{
                        padding: "18px 14px",
                        borderRadius: 14,
                        border: "1px dashed rgba(71,85,105,0.6)",
                        color: "#94a3b8",
                        background: "rgba(15,23,42,0.25)",
                        fontSize: 12,
                        fontWeight: 650,
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#e2e8f0" }}>{t("cartaImport.noResultsTitle")}</div>
                      <div style={{ marginTop: 6 }}>{t("cartaImport.noResultsBody")}</div>
                    </div>
                  ) : null}

                  {grouped.map((g) => (
                    <section
                      key={g.categoria}
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(71, 85, 105, 0.55)",
                        background: "rgba(15,23,42,0.35)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "baseline",
                          borderBottom: "1px solid rgba(51, 65, 85, 0.45)",
                          background: "linear-gradient(90deg, rgba(56,189,248,0.08) 0%, rgba(15,23,42,0) 65%)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 950, color: "#f1f5f9" }}>{g.categoria}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                          {t("cartaImport.itemsCount", { count: String(g.rows.length) })}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {g.rows.map((r) => {
                          const sev = getSeverity(r);
                          const isActive = r.tempId === activeId;
                          const sevTone =
                            sev === "ok"
                              ? { dot: "rgba(52,211,153,0.7)", bg: "transparent" }
                              : sev === "review"
                                ? { dot: "rgba(251,191,36,0.8)", bg: "rgba(69,26,3,0.14)" }
                                : { dot: "rgba(248,113,113,0.85)", bg: "rgba(127,29,29,0.12)" };

                          const family = (r.familia ?? "").trim();
                          const hasDup = (r.potentialDuplicates?.length ?? 0) > 0;
                          const action = r.action ?? "create_new";

                          return (
                            <button
                              key={r.tempId}
                              type="button"
                              onClick={() => openRow(r.tempId)}
                              style={{
                                border: "none",
                                textAlign: "left",
                                background: isActive ? "rgba(30,41,59,0.45)" : sevTone.bg,
                                color: "#e2e8f0",
                                padding: "10px 12px",
                                display: "grid",
                                gridTemplateColumns: "12px 1.35fr 0.6fr 0.65fr",
                                gap: 10,
                                alignItems: "center",
                                cursor: "pointer",
                                borderBottom: "1px solid rgba(51, 65, 85, 0.25)",
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  background: sevTone.dot,
                                  boxShadow: sev !== "ok" ? "0 0 16px rgba(251,191,36,0.08)" : "none",
                                }}
                                aria-hidden
                              />

                              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 900,
                                      color: "#f8fafc",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {r.nombre || t("cartaImport.unnamed")}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 900,
                                      letterSpacing: "0.08em",
                                      textTransform: "uppercase",
                                      padding: "3px 8px",
                                      borderRadius: 999,
                                      border: "1px solid rgba(71,85,105,0.55)",
                                      color: "#94a3b8",
                                      background: "rgba(2,6,23,0.12)",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {t(TIPO_KEYS[r.tipoVenta])}
                                  </span>
                                  {hasDup ? (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 900,
                                        letterSpacing: "0.06em",
                                        textTransform: "uppercase",
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        border: "1px solid rgba(251,191,36,0.3)",
                                        background: "rgba(69,26,3,0.18)",
                                        color: "#fde68a",
                                        flexShrink: 0,
                                      }}
                                      title={t("cartaImport.badgeDuplicate")}
                                    >
                                      {t("cartaImport.dupBadge")}
                                    </span>
                                  ) : null}
                                  {family ? (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 900,
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        border: "1px solid rgba(56,189,248,0.25)",
                                        background: "rgba(8,47,73,0.16)",
                                        color: "#7dd3fc",
                                        whiteSpace: "nowrap",
                                        flexShrink: 0,
                                      }}
                                      title={t("cartaImport.familyLabel")}
                                    >
                                      {family}
                                    </span>
                                  ) : null}
                                </div>
                                {sev !== "ok" ? (
                                  <div style={{ fontSize: 11, color: sev === "error" ? "#fecaca" : "#fde68a", fontWeight: 750 }}>
                                    {sev === "error" ? t("cartaImport.sevError") : t("cartaImport.sevReview")}
                                  </div>
                                ) : null}
                                {hasDup ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <label style={{ fontSize: 10, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                      {t("cartaImport.dupActionLabel")}
                                    </label>
                                    <select
                                      value={action}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const nextAction = e.target.value as ExtractedMenuRow["action"];
                                        const first = r.potentialDuplicates?.[0]?.platoId ?? null;
                                        updateRow(r.tempId, {
                                          action: nextAction ?? "create_new",
                                          targetPlatoId:
                                            nextAction === "use_existing" || nextAction === "update_existing"
                                              ? r.targetPlatoId ?? first
                                              : null,
                                          selected: nextAction === "ignore" ? false : true,
                                        });
                                      }}
                                      style={{
                                        padding: "6px 8px",
                                        borderRadius: 10,
                                        border: "1px solid rgba(71,85,105,0.55)",
                                        background: "rgba(15,23,42,0.7)",
                                        color: "#e2e8f0",
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                      }}
                                      aria-label={t("cartaImport.dupActionLabel")}
                                    >
                                      <option value="create_new">{t("cartaImport.dupActionCreate")}</option>
                                      <option value="use_existing">{t("cartaImport.dupActionUse")}</option>
                                      <option value="update_existing">{t("cartaImport.dupActionUpdate")}</option>
                                      <option value="ignore">{t("cartaImport.dupActionIgnore")}</option>
                                    </select>

                                    {(action === "use_existing" || action === "update_existing") ? (
                                      <>
                                        <label style={{ fontSize: 10, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                          {t("cartaImport.dupPickExisting")}
                                        </label>
                                        <select
                                          value={r.targetPlatoId ?? ""}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => updateRow(r.tempId, { targetPlatoId: e.target.value || null })}
                                          style={{
                                            padding: "6px 8px",
                                            borderRadius: 10,
                                            border: "1px solid rgba(71,85,105,0.55)",
                                            background: "rgba(15,23,42,0.7)",
                                            color: "#e2e8f0",
                                            fontSize: 11,
                                            fontWeight: 800,
                                            cursor: "pointer",
                                            maxWidth: 260,
                                          }}
                                          aria-label={t("cartaImport.dupPickExisting")}
                                          title={t("cartaImport.dupPickExistingHint")}
                                        >
                                          <option value="">{t("common.selectEllipsis")}</option>
                                          {(r.potentialDuplicates ?? [])
                                            .map((d) => catalogOptions.find((c) => c.id === d.platoId))
                                            .filter((x): x is { id: string; nombre: string; categoria: string; precioVenta: number } => Boolean(x))
                                            .map((opt) => (
                                              <option key={opt.id} value={opt.id}>
                                                {opt.nombre} · {opt.categoria} · {opt.precioVenta.toFixed(2).replace(".", ",")}€
                                              </option>
                                            ))}
                                        </select>
                                      </>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>

                              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                <div style={{ fontSize: 13, fontWeight: 950, color: "#fde68a" }}>
                                  {Number.isFinite(r.precio) ? `${r.precio.toFixed(2).replace(".", ",")} €` : t("cartaImport.missingPrice")}
                                </div>
                              </div>

                              <div style={{ justifySelf: "end", fontSize: 11, color: "#94a3b8", fontWeight: 850 }}>
                                {t("cartaImport.openEdit")}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setStep("publish")}
                  style={{
                    border: creating ? "1px solid rgba(71, 85, 105, 0.5)" : "1px solid rgba(34, 197, 94, 0.55)",
                    background: creating
                      ? "rgba(71, 85, 105, 0.35)"
                      : "linear-gradient(180deg, rgba(34, 197, 94, 0.38) 0%, rgba(21, 128, 61, 0.28) 100%)",
                    color: creating ? "#64748b" : "#dcfce7",
                    padding: "12px 20px",
                    borderRadius: 12,
                    fontWeight: 900,
                    cursor: creating ? "not-allowed" : "pointer",
                    fontSize: 14,
                    boxShadow: creating ? "none" : "0 3px 18px rgba(34, 197, 94, 0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  {t("cartaImport.continueToPublish")}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={clearCartaFile}
                  style={{
                    border: "1px solid rgba(71, 85, 105, 0.55)",
                    background: "rgba(15,23,42,0.35)",
                    color: "#cbd5e1",
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 900,
                    cursor: creating ? "not-allowed" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {t("cartaImport.backToUpload")}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={saveDraft}
                  style={{
                    border: "1px solid rgba(71, 85, 105, 0.55)",
                    background: "rgba(15,23,42,0.25)",
                    color: "#94a3b8",
                    padding: "12px 14px",
                    borderRadius: 12,
                    fontWeight: 900,
                    cursor: creating ? "not-allowed" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {t("cartaImport.saveDraft")}
                </button>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {t("cartaImport.selectedCount", {
                    count: String(rows.filter((x) => x.selected).length),
                    total: String(rows.length),
                  })}
                </span>
                {draftSavedAt ? (
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{t("cartaImport.draftSaved")}</span>
                ) : null}
              </div>
            </div>

            <div
              style={{
                flex: "0.9 1 320px",
                minWidth: 260,
                maxWidth: 420,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Panel lateral: edición del item seleccionado */}
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.18), 0 18px 44px rgba(0,0,0,0.32)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 12px 10px",
                    borderBottom: "1px solid rgba(51, 65, 85, 0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "linear-gradient(90deg, rgba(56,189,248,0.08) 0%, rgba(15,23,42,0) 65%)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                      {t("cartaImport.editorTitle")}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 13, fontWeight: 950, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {panelDraft?.nombre || t("cartaImport.editorEmptyTitle")}
                    </div>
                  </div>
                  {activeId ? (
                    <button
                      type="button"
                      onClick={closePanel}
                      style={{
                        border: "1px solid rgba(71,85,105,0.55)",
                        background: "transparent",
                        color: "#94a3b8",
                        padding: "6px 10px",
                        borderRadius: 10,
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("cartaImport.close")}
                    </button>
                  ) : null}
                </div>

                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {!activeId || !panelDraft ? (
                    <div style={{ padding: "14px 12px", borderRadius: 12, border: "1px dashed rgba(71,85,105,0.55)", color: "#94a3b8", fontSize: 12, fontWeight: 650, lineHeight: 1.45 }}>
                      {t("cartaImport.editorEmptyBody")}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          {t("cartaImport.fieldName")}
                        </label>
                        <input
                          value={panelDraft.nombre}
                          onChange={(e) => setPanelDraft((p) => (p ? { ...p, nombre: e.target.value } : p))}
                          style={cellInp}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ display: "grid", gap: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {t("cartaImport.fieldPrice")}
                          </label>
                          <input
                            value={panelDraft.precio}
                            onChange={(e) => setPanelDraft((p) => (p ? { ...p, precio: e.target.value } : p))}
                            style={{ ...cellInp, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                            placeholder="0,00"
                          />
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {t("cartaImport.fieldType")}
                          </label>
                          <select
                            value={panelDraft.tipoVenta}
                            onChange={(e) => setPanelDraft((p) => (p ? { ...p, tipoVenta: e.target.value as TipoProductoVenta } : p))}
                            style={{ ...cellInp, cursor: "pointer" }}
                          >
                            {TIPOS_PRODUCTO_VENTA.map((tv) => (
                              <option key={tv} value={tv}>
                                {t(TIPO_KEYS[tv])}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          {t("cartaImport.fieldCategory")}
                        </label>
                        <input
                          value={panelDraft.categoria}
                          onChange={(e) => setPanelDraft((p) => (p ? { ...p, categoria: e.target.value } : p))}
                          style={cellInp}
                          list="hostly-carta-import-cats"
                        />
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          {t("cartaImport.fieldFamily")}
                        </label>
                        <input
                          value={panelDraft.familia}
                          onChange={(e) => setPanelDraft((p) => (p ? { ...p, familia: e.target.value } : p))}
                          style={cellInp}
                          placeholder={t("cartaImport.familyPlaceholder")}
                        />
                        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>{t("cartaImport.familyHint")}</div>
                      </div>

                      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, fontWeight: 850, color: "#cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={panelDraft.disponible}
                          onChange={(e) => setPanelDraft((p) => (p ? { ...p, disponible: e.target.checked } : p))}
                        />
                        {t("cartaImport.fieldAvailable")}
                      </label>

                      {(() => {
                        const r = rows.find((x) => x.tempId === activeId);
                        if (!r?.iaNotes?.length) return null;
                        return (
                          <div style={{ borderRadius: 12, border: "1px solid rgba(251,191,36,0.22)", background: "rgba(69,26,3,0.14)", padding: "10px 10px" }}>
                            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fde68a" }}>
                              {t("cartaImport.iaNotes")}
                            </div>
                            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                              {r.iaNotes.map((n) => (
                                <div key={n} style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 650, lineHeight: 1.4 }}>
                                  {n}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => savePanel()}
                          style={{
                            border: "1px solid rgba(56,189,248,0.35)",
                            background: "rgba(8,47,73,0.22)",
                            color: "#bae6fd",
                            padding: "12px 14px",
                            borderRadius: 12,
                            fontWeight: 950,
                            cursor: "pointer",
                            fontSize: 13,
                            flex: "1 1 140px",
                          }}
                        >
                          {t("cartaImport.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => savePanel({ goNext: true })}
                          style={{
                            border: "1px solid rgba(34, 197, 94, 0.55)",
                            background: "linear-gradient(180deg, rgba(34, 197, 94, 0.3) 0%, rgba(21, 128, 61, 0.22) 100%)",
                            color: "#dcfce7",
                            padding: "12px 14px",
                            borderRadius: 12,
                            fontWeight: 950,
                            cursor: "pointer",
                            fontSize: 13,
                            flex: "1 1 160px",
                          }}
                        >
                          {t("cartaImport.saveNext")}
                        </button>
                        <button
                          type="button"
                          onClick={applyToFamily}
                          disabled={!panelDraft.familia.trim()}
                          style={{
                            border: "1px solid rgba(251,191,36,0.28)",
                            background: "rgba(69,26,3,0.18)",
                            color: "#fde68a",
                            padding: "12px 14px",
                            borderRadius: 12,
                            fontWeight: 950,
                            cursor: panelDraft.familia.trim() ? "pointer" : "not-allowed",
                            fontSize: 13,
                            width: "100%",
                          }}
                        >
                          {t("cartaImport.applyFamily")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.18), 0 18px 44px rgba(0,0,0,0.32)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                  {t("cartaImport.rightSummaryTitle")}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
                    <span>{t("cartaImport.rightLines")}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                    <span>{t("cartaImport.rightPlates")}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{typeCounts.plato}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                    <span>{t("cartaImport.rightDrinks")}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{typeCounts.bebida}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(248,113,113,0.18)",
                  background: "linear-gradient(145deg, rgba(127,29,29,0.14) 0%, rgba(15,23,42,0.82) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fecaca" }}>
                  {t("cartaImport.rightAlertsTitle")}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {missingPriceCount ? (
                    <button
                      type="button"
                      onClick={() => setFilter("alerts")}
                      style={{ textAlign: "left", background: "transparent", border: "none", color: "#e2e8f0", padding: 0, cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{t("cartaImport.alertMissingPrice", { count: String(missingPriceCount) })}</span>
                    </button>
                  ) : null}
                  {duplicateCount ? (
                    <button
                      type="button"
                      onClick={() => setFilter("alerts")}
                      style={{ textAlign: "left", background: "transparent", border: "none", color: "#e2e8f0", padding: 0, cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{t("cartaImport.alertDuplicates", { count: String(duplicateCount) })}</span>
                    </button>
                  ) : null}
                  {lowConfCategoryCount ? (
                    <button
                      type="button"
                      onClick={() => setFilter("alerts")}
                      style={{ textAlign: "left", background: "transparent", border: "none", color: "#e2e8f0", padding: 0, cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{t("cartaImport.alertCategoryLow", { count: String(lowConfCategoryCount) })}</span>
                    </button>
                  ) : null}
                  {incompleteNameCount ? (
                    <button
                      type="button"
                      onClick={() => setFilter("alerts")}
                      style={{ textAlign: "left", background: "transparent", border: "none", color: "#e2e8f0", padding: 0, cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{t("cartaImport.alertNameIncomplete", { count: String(incompleteNameCount) })}</span>
                    </button>
                  ) : null}
                  {toReviewCount === 0 ? <div style={{ fontSize: 12, color: "#94a3b8" }}>{t("cartaImport.alertNone")}</div> : null}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>{t("cartaImport.alertHint")}</div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(251, 191, 36, 0.22)",
                  background: "linear-gradient(145deg, rgba(69,26,3,0.22) 0%, rgba(15,23,42,0.75) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fde68a" }}>
                  {t("cartaImport.rightRecommendedTitle")}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {[t("cartaImport.rightRec1"), t("cartaImport.rightRec2"), t("cartaImport.rightRec3")].map((line) => (
                    <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, background: "rgba(251,191,36,0.55)" }} aria-hidden />
                      <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 650, lineHeight: 1.4 }}>{line}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(56, 189, 248, 0.22)",
                  background: "linear-gradient(145deg, rgba(8,47,73,0.25) 0%, rgba(15,23,42,0.78) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7dd3fc" }}>
                  {t("cartaImport.rightPublishTitle")}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#bae6fd", fontWeight: 650, lineHeight: 1.45 }}>
                  {t("cartaImport.rightPublishBody")}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === "publish" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <CartaImportWizardRail variant="dashboard" activeStep={4} completedThrough={3} compact />

          <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0, overflow: "hidden", alignItems: "stretch", flexWrap: "nowrap" }}>
            <div style={{ flex: "1.4 1 560px", minWidth: 320, minHeight: 0, display: "flex", overflow: "hidden" }}>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.92) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 20px 50px rgba(0,0,0,0.35)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    padding: "14px 16px 12px",
                    borderBottom: "1px solid rgba(51, 65, 85, 0.55)",
                    background: "linear-gradient(90deg, rgba(52,211,153,0.12) 0%, rgba(15,23,42,0) 65%)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#64748b" }}>
                    {t("cartaImport.publishEyebrow")}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 20, fontWeight: 950, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                    {t("cartaImport.publishTitle")}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 650, color: "#94a3b8", lineHeight: 1.45, maxWidth: 620 }}>
                    {t("cartaImport.publishSub")}
                  </div>
                </div>

                <div style={{ padding: 16, display: "grid", gap: 10, flex: 1, minHeight: 0, overflow: "auto" }}>
                  <div
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(56,189,248,0.22)",
                      background: "linear-gradient(145deg, rgba(8,47,73,0.25) 0%, rgba(15,23,42,0.78) 100%)",
                      padding: "12px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7dd3fc" }}>
                      {t("cartaImport.publishSummaryTitle")}
                    </div>
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#e2e8f0", fontWeight: 800 }}>
                        <span>{t("cartaImport.publishWillCreate")}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {
                          rows.filter(
                            (r) =>
                              r.selected &&
                              (r.action ?? "create_new") !== "ignore" &&
                              (r.action ?? "create_new") !== "pending_review" &&
                              r.nombre.trim() &&
                              Number.isFinite(r.precio) &&
                              r.precio >= 0,
                          ).length
                        }
                      </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                        <span>{t("cartaImport.publishExcluded")}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {rows.filter((r) => !r.selected || (r.action ?? "create_new") === "ignore").length}
                      </span>
                      </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                      <span>{t("cartaImport.summaryPendingReview")}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {rows.filter((r) => r.selected && (r.action ?? "create_new") === "pending_review").length}
                      </span>
                    </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                        <span>{t("cartaImport.publishCategories")}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{categoriesCount}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                        <span>{t("cartaImport.publishAlerts")}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toReviewCount}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(251,191,36,0.22)",
                      background: "rgba(69,26,3,0.14)",
                      padding: "12px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fde68a" }}>
                      {t("cartaImport.publishControlTitle")}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#e2e8f0", fontWeight: 650, lineHeight: 1.45 }}>
                      {t("cartaImport.publishControlBody")}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid rgba(51, 65, 85, 0.55)",
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 650 }}>{t("cartaImport.publishFooterHint")}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setStep("review")}
                      style={{
                        border: "1px solid rgba(71, 85, 105, 0.55)",
                        background: "rgba(15,23,42,0.35)",
                        color: "#cbd5e1",
                        padding: "12px 16px",
                        borderRadius: 12,
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {t("cartaImport.backToReview")}
                    </button>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={confirmCreate}
                      style={{
                        border: creating ? "1px solid rgba(71, 85, 105, 0.5)" : "1px solid rgba(34, 197, 94, 0.55)",
                        background: creating
                          ? "rgba(71, 85, 105, 0.35)"
                          : "linear-gradient(180deg, rgba(34, 197, 94, 0.38) 0%, rgba(21, 128, 61, 0.28) 100%)",
                        color: creating ? "#64748b" : "#dcfce7",
                        padding: "12px 20px",
                        borderRadius: 12,
                        fontWeight: 950,
                        cursor: creating ? "not-allowed" : "pointer",
                        fontSize: 14,
                        boxShadow: creating ? "none" : "0 3px 18px rgba(34, 197, 94, 0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
                      }}
                    >
                      {creating ? t("cartaImport.creating") : t("cartaImport.publishCta")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                flex: "0.9 1 320px",
                minWidth: 260,
                maxWidth: 420,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(71, 85, 105, 0.55)",
                  background: "linear-gradient(165deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.18), 0 18px 44px rgba(0,0,0,0.32)",
                  padding: "12px 12px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                  {t("cartaImport.publishRightTitle")}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#cbd5e1", fontWeight: 650, lineHeight: 1.45 }}>
                  {t("cartaImport.publishRightBody")}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
          <CartaImportWizardRail variant="dashboard" activeStep={4} completedThrough={4} compact />
          <div
            style={{
              flex: 1,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 22,
              borderRadius: 12,
              border: "1px solid rgba(52, 211, 153, 0.28)",
              background: "linear-gradient(165deg, rgba(6, 78, 59, 0.22) 0%, rgba(15, 23, 42, 0.55) 100%)",
              boxShadow: "inset 0 1px 0 rgba(167, 243, 208, 0.06)",
            }}
          >
          <div style={{ fontSize: 17, fontWeight: 800, color: "#a7f3d0" }}>{t("cartaImport.doneTitle")}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", maxWidth: 520, lineHeight: 1.45 }}>
            {t("cartaImport.doneBody", { count: String(createdCount) })}
          </div>
          <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 8, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#e2e8f0", fontWeight: 750 }}>
              <span>{t("cartaImport.summaryCreated")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{createdCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
              <span>{t("cartaImport.summaryLinked")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{linkedCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
              <span>{t("cartaImport.summaryUpdated")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{updatedCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
              <span>{t("cartaImport.summaryIgnored")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{ignoredCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#fde68a", fontWeight: 800 }}>
              <span>{t("cartaImport.summaryPendingReview")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{pendingReviewCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#fde68a", fontWeight: 800 }}>
              <span>{t("cartaImport.summaryPendingCost")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{pendingCostCount}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard/operacion/tpv")}
            style={{
              marginTop: 4,
              border: "1px solid rgba(34, 197, 94, 0.55)",
              background: "linear-gradient(180deg, rgba(34, 197, 94, 0.35) 0%, rgba(21, 128, 61, 0.25) 100%)",
              color: "#dcfce7",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 3px 18px rgba(34, 197, 94, 0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {t("cartaImport.backToCatalogCta")}
          </button>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "center" }}>
            {t("cartaImport.doneRedirectHint")}
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
