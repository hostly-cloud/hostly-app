"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlyKpiCard,
  HostlySection,
  HostlySectionHeader,
  HostlySegmentedControl,
  HostlySurface,
  hostlySegmentTabClassName,
} from "@/components/ui/hostly";
import {
  type MermaLocal,
  type MermaMotivo,
  MERMA_MOTIVOS,
  formatFechaMerma,
  loadMermas,
  newMermaId,
  saveMermas,
} from "@/lib/mermas-local";
import { reconcileMermaStock, undoMermaStockEffect } from "@/lib/mermas-stock-sync";
import type { StockProducto } from "@/lib/stock-local";
import { loadStock, saveStock } from "@/lib/stock-local";

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  boxShadow: "var(--hostly-shadow-hairline)",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  marginBottom: 6,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
};

/** Input de búsqueda alineado con inventario / shell claro. */
const tpvSearchInput: CSSProperties = {
  padding: "5px 8px",
  borderRadius: 10,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  minHeight: 30,
  boxShadow: "var(--hostly-shadow-hairline)",
};

const tabularQty: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseCantidadInput(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Fecha ISO (YYYY-MM-DD) de hace `days` días. */
function isoDaysAgo(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatMotivoLabel(m: string): string {
  return m
    .split(" ")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatEuro(n: number, locale: "es" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function topProductByQty(list: MermaLocal[]): string | null {
  if (list.length === 0) return null;
  const map = new Map<string, number>();
  for (const m of list) {
    const k = (m.producto_stock_nombre || "").trim() || m.producto_stock_id;
    map.set(k, (map.get(k) ?? 0) + m.cantidad);
  }
  let best: string | null = null;
  let max = 0;
  for (const [name, sum] of map) {
    if (sum > max) {
      max = sum;
      best = name;
    }
  }
  return best;
}

function topMotivo(list: MermaLocal[]): MermaMotivo | null {
  if (list.length === 0) return null;
  const map = new Map<MermaMotivo, number>();
  for (const m of list) {
    map.set(m.motivo, (map.get(m.motivo) ?? 0) + 1);
  }
  let best: MermaMotivo | null = null;
  let max = 0;
  for (const [mo, c] of map) {
    if (c > max) {
      max = c;
      best = mo;
    }
  }
  return best;
}

function motivoBadgeStyles(motivo: MermaMotivo): { bg: string; border: string; color: string } {
  switch (motivo) {
    case "caducado":
      return { bg: "var(--hostly-warning-soft)", border: "rgba(217, 119, 6, 0.35)", color: "#92400e" };
    case "roto":
      return { bg: "var(--hostly-danger-soft)", border: "rgba(220, 38, 38, 0.3)", color: "#991b1b" };
    case "error cocina":
      return { bg: "var(--hostly-info-soft)", border: "rgba(49, 95, 125, 0.35)", color: "var(--hostly-navy-deep)" };
    case "invitación":
      return { bg: "rgba(237, 233, 254, 0.85)", border: "rgba(124, 58, 237, 0.28)", color: "#5b21b6" };
    default:
      return { bg: "var(--hostly-surface-operational)", border: "var(--hostly-table-divider-soft)", color: "var(--hostly-ink-muted)" };
  }
}

type MotivoListFilter = "todos" | MermaMotivo;

/** Módulo TPV: KPIs, alta, buscador, filtros y listado. Panel análisis (mermas.analysis*) retirado de la vista; strings siguen en locales. */
export default function MermasPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<MermaLocal[]>([]);
  const [stockRows, setStockRows] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFecha, setDraftFecha] = useState("");
  const [draftProductoId, setDraftProductoId] = useState("");
  const [draftCantidad, setDraftCantidad] = useState("");
  const [draftMotivo, setDraftMotivo] = useState<MermaMotivo>("otro");
  const [draftNotas, setDraftNotas] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [motivoListFilter, setMotivoListFilter] = useState<MotivoListFilter>("todos");

  const refresh = useCallback(() => {
    setItems(loadMermas());
    setStockRows(loadStock());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return b.id.localeCompare(a.id);
    });
  }, [items]);

  const motivoFiltered = useMemo(() => {
    if (motivoListFilter === "todos") return sorted;
    return sorted.filter((m) => m.motivo === motivoListFilter);
  }, [sorted, motivoListFilter]);

  const displayedMermas = useMemo(() => {
    const q = normalizeForSearch(listSearch);
    if (!q) return motivoFiltered;
    return motivoFiltered.filter((m) => {
      const name = normalizeForSearch(m.producto_stock_nombre || "");
      const motivo = normalizeForSearch(formatMotivoLabel(m.motivo));
      const notas = normalizeForSearch(m.notas || "");
      const fecha = normalizeForSearch(m.fecha);
      const id = normalizeForSearch(m.producto_stock_id);
      const shownFecha = normalizeForSearch(formatFechaMerma(m.fecha));
      return (
        name.includes(q) ||
        motivo.includes(q) ||
        notas.includes(q) ||
        fecha.includes(q) ||
        id.includes(q) ||
        shownFecha.includes(q)
      );
    });
  }, [motivoFiltered, listSearch]);

  const isoToday = todayIso();
  const cutoff30 = isoDaysAgo(30);

  const itemsLast30 = useMemo(() => items.filter((m) => m.fecha >= cutoff30), [items, cutoff30]);

  const lostCostEuro = useMemo(() => {
    return 0;
  }, []);

  const topProduct30 = useMemo(() => topProductByQty(itemsLast30), [itemsLast30]);
  const topProductAll = useMemo(() => (items.length > 0 ? topProductByQty(items) : null), [items]);
  const kpiTopProduct = topProduct30 ?? topProductAll;

  const topMotivo30 = useMemo(() => topMotivo(itemsLast30), [itemsLast30]);
  const topMotivoAll = useMemo(() => (items.length > 0 ? topMotivo(items) : null), [items]);
  const kpiTopMotivo = topMotivo30 ?? topMotivoAll;

  function openCreate() {
    setEditingId(null);
    setDraftFecha(isoToday);
    setDraftProductoId("");
    setDraftCantidad("");
    setDraftMotivo("otro");
    setDraftNotas("");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function openEdit(m: MermaLocal) {
    setEditingId(m.id);
    setDraftFecha(m.fecha);
    setDraftProductoId(m.producto_stock_id);
    setDraftCantidad(String(m.cantidad));
    setDraftMotivo(m.motivo);
    setDraftNotas(m.notas ?? "");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function submit() {
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFecha.trim())) {
      setFormError(t("mermas.errorInvalidDate"));
      return;
    }
    const pid = draftProductoId.trim();
    if (!pid) {
      setFormError(t("mermas.errorPickProduct"));
      return;
    }
    const qty = parseCantidadInput(draftCantidad);
    if (qty == null) {
      setFormError(t("mermas.errorQtyPositive"));
      return;
    }
    const stock = loadStock();
    const p = stock.find((x) => x.id === pid);
    const prev =
      editingId != null ? (loadMermas().find((x) => x.id === editingId) ?? null) : null;
    const nextRaw: MermaLocal = {
      id: editingId ?? newMermaId(),
      fecha: draftFecha.trim(),
      producto_stock_id: pid,
      producto_stock_nombre: p?.nombre ?? "",
      unidad: p?.unidad ?? "uds",
      cantidad: qty,
      motivo: draftMotivo,
      notas: draftNotas.trim() || undefined,
      stock_aplicado: false,
    };
    const { stock: newStock, merma, error } = reconcileMermaStock(prev, nextRaw, stock);
    if (error) {
      setFormError(error);
      return;
    }
    const nextMermas =
      editingId != null
        ? loadMermas().map((x) => (x.id === editingId ? merma : x))
        : [...loadMermas(), merma];
    saveMermas(nextMermas);
    saveStock(newStock);
    setItems(nextMermas);
    setStockRows(newStock);
    closeForm();
  }

  function remove(id: string) {
    if (!window.confirm(t("mermas.confirmDelete"))) return;
    const m = loadMermas().find((x) => x.id === id);
    if (!m) return;
    let st = loadStock();
    st = undoMermaStockEffect(m, st);
    const nextMermas = loadMermas().filter((x) => x.id !== id);
    saveMermas(nextMermas);
    saveStock(st);
    setItems(nextMermas);
    setStockRows(st);
    if (editingId === id) closeForm();
  }

  const kpiCards = useMemo(
    () => [
      {
        title: t("mermas.kpiLostCostTitle"),
        value: formatEuro(lostCostEuro, locale),
        sub: t("mermas.kpiLostCostSub"),
        accent: "#fbbf24",
      },
      {
        title: t("mermas.kpiRegisteredTitle"),
        value: String(items.length),
        sub: t("mermas.kpiRegisteredSub"),
        accent: "#60a5fa",
      },
      {
        title: t("mermas.kpiTopProductTitle"),
        value: kpiTopProduct ?? t("common.emDash"),
        sub: kpiTopProduct
          ? topProduct30 != null
            ? t("mermas.kpiBasedOnWindow")
            : t("mermas.kpiBasedOnAll")
          : t("mermas.kpiTopProductEmptySub"),
        accent: "#a78bfa",
      },
      {
        title: t("mermas.kpiTopReasonTitle"),
        value: kpiTopMotivo ? formatMotivoLabel(kpiTopMotivo) : t("common.emDash"),
        sub: kpiTopMotivo
          ? topMotivo30 != null
            ? t("mermas.kpiBasedOnWindow")
            : t("mermas.kpiBasedOnAll")
          : t("mermas.kpiTopReasonEmptySub"),
        accent: "var(--hostly-ink-muted)",
      },
    ],
    [
      t,
      items.length,
      lostCostEuro,
      locale,
      kpiTopProduct,
      kpiTopMotivo,
      topProduct30,
      topMotivo30,
    ],
  );

  if (!hydrated) {
    return (
      <ModulePageShell
        {...inventoryHubShellLayout}
        title={t("mermas.title")}
        subtitle={t("mermas.loadingSubtitle")}
        headerBelow={<InventarioRouteTabs />}
      >
        <p className="hostly-muted mb-0 !text-[13px]">{t("common.preparing")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      {...inventoryHubShellLayout}
      title={t("mermas.title")}
      subtitle={t("mermas.subtitle")}
      headerBelow={<InventarioRouteTabs />}
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          className="hostly-button-secondary hostly-button-compact shrink-0 whitespace-nowrap !border-amber-400/40 !bg-amber-50 !font-semibold !text-[color:#78350f] hover:!border-amber-400/55 hover:!bg-amber-100/90"
        >
          {t("mermas.registerMermaCta")}
        </button>
      }
    >
      <HostlySection stack="sm" className="min-h-0 flex-1 overflow-hidden">
        {/* KPI — tarjetas claras con acento superior */}
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
            gap: 10,
          }}
        >
          {kpiCards.map((card) => (
            <HostlyKpiCard
              key={card.title}
              title={card.title}
              value={card.value}
              helper={card.sub}
              accentColor={card.accent}
              valueTitle={card.value}
              className="px-3 py-2"
            />
          ))}
        </div>

        {/* Listado */}
        <HostlySurface variant="ice" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden box-border">
          <div
            style={{
              flexShrink: 0,
              padding: "5px 8px 3px",
              borderBottom: sorted.length > 0 ? "1px solid var(--hostly-table-divider-soft)" : undefined,
            }}
          >
            <HostlySectionHeader
              title={t("mermas.activityTitle")}
              description={sorted.length > 0 ? `${displayedMermas.length} / ${sorted.length}` : undefined}
              descriptionClassName="m-0 !text-[11px] !leading-snug text-[color:var(--hostly-ink-muted)] !font-semibold tabular-nums"
              className="w-full min-w-0 flex-wrap items-end"
            >
              {sorted.length > 0 ? (
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("mermas.searchPlaceholder")}
                  autoComplete="off"
                  aria-label={t("mermas.searchPlaceholder")}
                  style={{
                    ...tpvSearchInput,
                    minWidth: 160,
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: "220px",
                    maxWidth: 400,
                  }}
                />
              ) : null}
            </HostlySectionHeader>
          </div>

          {sorted.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "10px 12px 12px",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: "1 1 280px", maxWidth: 560 }}>
                  <h3 className="hostly-heading mb-0 !text-base !font-semibold">{t("mermas.emptyPremiumTitle")}</h3>
                  <p className="hostly-muted mb-0 mt-2 text-[13px] leading-normal">{t("mermas.emptyPremiumBody")}</p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {(
                  [
                    { title: t("mermas.insight1Title"), body: t("mermas.insight1Body") },
                    { title: t("mermas.insight2Title"), body: t("mermas.insight2Body") },
                    { title: t("mermas.insight3Title"), body: t("mermas.insight3Body") },
                  ] as const
                ).map((ins) => (
                  <HostlySurface variant="ice" key={ins.title} className="box-border px-2.5 py-1.5">
                    <p className="m-0 text-xs font-semibold leading-snug text-[color:var(--hostly-ink-strong)]">{ins.title}</p>
                    <p className="hostly-muted m-0 mt-1 !text-[11px] !leading-snug">{ins.body}</p>
                  </HostlySurface>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  rowGap: 6,
                  padding: "4px 8px 6px",
                }}
              >
                <span className="hostly-kpi-label !text-[10px]">{t("stock.filterHint")}</span>
                <HostlySegmentedControl aria-label={t("stock.filterHint")} className="min-w-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={motivoListFilter === "todos"}
                    className={hostlySegmentTabClassName()}
                    onClick={() => setMotivoListFilter("todos")}
                  >
                    {t("stock.filterAll")}
                  </button>
                  {MERMA_MOTIVOS.map((mo) => (
                    <button
                      key={mo}
                      type="button"
                      role="tab"
                      aria-selected={motivoListFilter === mo}
                      className={hostlySegmentTabClassName("max-w-full")}
                      onClick={() => setMotivoListFilter(mo)}
                    >
                      {formatMotivoLabel(mo)}
                    </button>
                  ))}
                </HostlySegmentedControl>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "6px 10px 10px",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {displayedMermas.length === 0 ? (
                  <div className="hostly-muted px-2 py-4 text-center text-[13px]">{t("mermas.searchNoResults")}</div>
                ) : (                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {displayedMermas.map((m) => {
                      const badge = motivoBadgeStyles(m.motivo);
                      return (
                        <div
                          key={m.id}
                          style={{
                            borderRadius: 8,
                            padding: "7px 9px",
                            background: "var(--hostly-surface-card-solid)",
                            border: "1px solid var(--hostly-table-divider-faint)",
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            transition: "background 0.14s ease, border-color 0.14s ease",
                          }}
                          className="transition-[background,border-color] hover:border-[color:var(--hostly-table-divider-soft)] hover:bg-[color:var(--hostly-table-row-hover)]"
                        >                          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "5px 8px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--hostly-ink-strong)",
                                  letterSpacing: "-0.015em",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "100%",
                                }}
                                title={m.producto_stock_nombre}
                              >
                                {m.producto_stock_nombre}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--hostly-ink-muted)", whiteSpace: "nowrap" }}>
                                {formatFechaMerma(m.fecha)}
                              </span>
                              <span
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  letterSpacing: "0.02em",
                                  background: badge.bg,
                                  border: `1px solid ${badge.border}`,
                                  color: badge.color,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatMotivoLabel(m.motivo)}
                              </span>
                            </div>
                            {m.notas ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 10,
                                  color: "var(--hostly-ink-muted)",
                                  fontStyle: "italic",
                                  lineHeight: 1.4,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={m.notas}
                              >
                                {m.notas}
                              </p>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: 10,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 8,
                                padding: "6px 10px",
                                borderRadius: 8,
                                background: "var(--hostly-surface-operational)",
                                border: "1px solid var(--hostly-table-divider-soft)",
                              }}
                            >
                              <span
                                style={{
                                  ...tabularQty,
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: m.fecha === isoToday ? "#c2410c" : "var(--hostly-navy-deep)",
                                  letterSpacing: "-0.03em",
                                  lineHeight: 1,
                                }}
                              >
                                {m.cantidad}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--hostly-ink-muted)" }}>{m.unidad}</span>
                            </div>
                            <button type="button" onClick={() => openEdit(m)} className="hostly-button-secondary !min-h-9 !px-3.5 !py-2 !text-[13px] !shadow-none">
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(m.id)}
                              className="hostly-button-secondary !min-h-9 !px-3.5 !py-2 !text-[13px] !shadow-none !border-red-200/70 !bg-[var(--hostly-danger-soft)] !font-semibold !text-red-900 hover:!border-red-300"
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </HostlySurface>
      </HostlySection>

      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merma-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(15, 39, 61, 0.28)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <HostlySurface
            variant="elevated"
            className="w-full max-h-[min(90vh,720px)] box-border overflow-y-auto p-5 max-w-[520px]"
            style={{ borderRadius: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="merma-modal-title" className="hostly-heading mb-0 !text-[20px] !font-semibold">
              {editingId ? t("mermas.modalEditTitle") : t("mermas.modalNewTitle")}
            </h2>
            <p className="hostly-muted mb-0 mt-2 text-sm leading-normal">{t("mermas.formHint")}</p>
            <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
              <div>
                <label style={labelStyle}>{t("common.date")}</label>
                <input type="date" value={draftFecha} onChange={(e) => setDraftFecha(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t("common.product")}</label>
                <select
                  value={draftProductoId}
                  onChange={(e) => setDraftProductoId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">{t("common.selectEllipsis")}</option>
                  {stockRows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.stock_actual} {p.unidad}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("common.quantity")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={draftCantidad}
                  onChange={(e) => setDraftCantidad(e.target.value)}
                  placeholder={t("mermas.qtyPlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("common.reason")}</label>
                <select
                  value={draftMotivo}
                  onChange={(e) => setDraftMotivo(e.target.value as MermaMotivo)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {MERMA_MOTIVOS.map((mo) => (
                    <option key={mo} value={mo}>
                      {formatMotivoLabel(mo)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("common.notesOptional")}</label>
                <input value={draftNotas} onChange={(e) => setDraftNotas(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {formError ? (
              <p className="mb-0 mt-4 text-sm font-semibold leading-snug text-[color:#b91c1c]">{formError}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button type="button" onClick={submit} className="hostly-button-primary !min-h-0 px-5 py-2.5 text-[15px]" style={{ flex: "1 1 160px" }}>
                {t("mermas.saveMerma")}
              </button>
              <button type="button" onClick={closeForm} className="hostly-button-secondary !min-h-0 px-5 py-2.5 text-[15px]">
                {t("common.cancel")}
              </button>
            </div>
          </HostlySurface>        </div>
      ) : null}
    </ModulePageShell>
  );
}
