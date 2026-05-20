"use client";

import type { CSSProperties, ReactNode, SVGProps } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { CategoriaCartaFormField } from "@/components/carta/categoria-carta-form-field";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyKpiCard, HostlySection, HostlySectionHeader, HostlySurface } from "@/components/ui/hostly";
import { fetchCartaCategorias, fetchCartaFamilias, createCartaCategoriaApi } from "@/lib/carta-categorias/api-client";
import { buildCartaGroupedSections } from "@/lib/carta-categorias/grouping";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import {
  cartaCategoriasForTipoYFamiliaFiltro,
  defaultCartaCategoriaTipoForTipoProducto,
  isCartaCategoriaCompatibleWithTipoProducto,
} from "@/lib/carta-categorias/filter-for-tipo-producto";
import type { CartaCategoria, CartaCategoriaTipo, CartaFamilia } from "@/lib/carta-categorias/types";
import { CARTA_MENU_FAMILIA_FILTER_UNASSIGNED, isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import {
  applyDefaultModifierFamilyIfEligible,
  fetchModifierFamiliesForRestaurante,
  type ModifierFamilyRow,
} from "@/lib/modificadores/default-modifier-family";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { fireAndForgetSyncCatalogoCategoria } from "@/lib/hostly/sync-catalogo-venta-categoria";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
import {
  bootstrapPlatosFromEscandallosIfEmpty,
  ensureEscandalloRowsForPlatos,
  fetchEscandalloMetaForIds,
  mirrorPlatoToEscandalloRow,
  type EscandalloMetaMap,
} from "@/lib/platos-escandallo-bridge";
import {
  PLATOS_CHANGED_EVENT,
  TIPOS_PRODUCTO_VENTA,
  createPlatoDraft,
  loadPlatos,
  savePlatos,
  type PlatoCarta,
  type TipoProductoVenta,
} from "@/lib/platos-local";
import type { Locale } from "@/lib/i18n";

type CartaFilter = "todos" | "activos" | "inactivos" | "conEscandallo" | "sinEscandallo";

const PRODUCTOS_ROW_HOVER_CLASS = "hostly-productos-data-row";
const PRODUCTOS_ROW_TEXT_BTN_CLASS = "hostly-productos-row-text-btn";
const PRODUCTOS_ROW_ICON_BTN_CLASS = "hostly-productos-row-icon-btn";

/** Data-grid: hover suave en fila + botones de acción compactos (config TPV). */
const productosTableInteractionStyles = `
.hostly-productos-data-row {
  transition: background-color 0.16s ease;
}
.hostly-productos-data-row:hover {
  background-color: rgba(248, 250, 252, 0.045) !important;
}
.hostly-productos-row-text-btn {
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease, opacity 0.14s ease;
}
.hostly-productos-row-text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.hostly-productos-row-icon-btn {
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
}
.hostly-productos-row-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
@media (hover: hover) and (pointer: fine) {
  .hostly-productos-row-text-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.04) !important;
    border-color: rgba(148, 163, 184, 0.16) !important;
    color: #cbd5e1 !important;
  }
  .hostly-productos-row-text-btn:active:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.025) !important;
  }
  .hostly-productos-row-icon-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.052) !important;
    border-color: rgba(148, 163, 184, 0.2) !important;
    color: #cbd5e1 !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hostly-productos-data-row,
  .hostly-productos-row-text-btn,
  .hostly-productos-row-icon-btn {
    transition: none;
  }
}
`;

/** Contenedor principal de la tabla (modo claro: superficie ice del design system; modo oscuro: legacy). */
const PRODUCTOS_TABLE_SECTION_DARK_STYLE: CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#1e293b",
  boxShadow: "none",
};

function ProductosTableChrome({
  iceVisual,
  embedFlatChrome,
  children,
}: {
  iceVisual: boolean;
  /** Menos “tarjeta sobre tarjeta” en Config → Carta → Productos */
  embedFlatChrome?: boolean;
  children: ReactNode;
}) {
  if (iceVisual) {
    if (embedFlatChrome) {
      return (
        <HostlySurface
          variant="flat"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 bg-transparent shadow-none"
        >
          {children}
        </HostlySurface>
      );
    }
    return (
      <HostlySurface variant="ice" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </HostlySurface>
    );
  }
  return <section style={PRODUCTOS_TABLE_SECTION_DARK_STYLE}>{children}</section>;
}

/** Botones de texto en columna Acciones: compactos, misma altura, no “texto flotante”. */
const productRowActionBtnShell: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 9,
  fontWeight: 550,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  minHeight: 22,
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(51, 65, 85, 0.38)",
  background: "rgba(15, 23, 42, 0.2)",
  color: "#8896a8",
};

function normCatKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const TIPO_VENTA_I18N: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

function labelTipoVenta(t: (key: string) => string, tipo: TipoProductoVenta): string {
  return t(TIPO_VENTA_I18N[tipo]);
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatEuro(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const tabularFigures: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/** Nombre: columna dominante (Stripe-like). */
const productRowNombreStyle: CSSProperties = {
  fontWeight: 700,
  color: "#f8fafc",
  fontSize: 14,
  lineHeight: 1.28,
  letterSpacing: "-0.02em",
  minWidth: 0,
  flex: "1 1 0%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const productRowPrecioStyle: CSSProperties = {
  ...tabularFigures,
  display: "block",
  width: "100%",
  minWidth: 0,
  textAlign: "right",
  fontWeight: 600,
  color: "#e2e8f0",
  fontSize: 12,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
};

/** Tipo: micro-etiqueta estrecha. */
const productRowTipoStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 590,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#5b6a7d",
  lineHeight: 1.2,
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Categoría carta: secundaria legible. */
const productRowCategoriaStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 480,
  color: "#758193",
  lineHeight: 1.26,
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 8,
};

/** Ancho útil del módulo: más protagonismo sin tocar sidebar de configuración. */
const PRODUCTOS_SHELL_MAX_WIDTH = 1520;
/** Mínimo horizontal del grid: scroll horizontal en pantallas estrechas, sin “tabla mini”. */
const PRODUCTOS_TABLE_MIN_WIDTH_PX = 980;
/** Con columna Acciones sólo iconos hay menos anchura útil tabular. */
const PRODUCTOS_TABLE_MIN_WIDTH_EMBED_ICONS_PX = 840;

const colHeadStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 560,
  color: "#5f7082",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1.18,
  display: "block",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "3px 4px",
};

/**
 * Data-grid: misma plantilla en cabecera, filas y barra de grupo.
 * Checkbox · nombre · tipo · categoría · PVP · carta · escandallo · acciones (embed config: sólo iconos).
 */
const PRODUCTOS_TABLE_GRID_TEMPLATE =
  "32px minmax(200px, 4fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(248px, 1.55fr)";

const PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED =
  "28px minmax(200px, 4fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(248px, 1.55fr)";
/** Config Carta embed: columna Acciones sólo iconos — más protagonismo datos. */
const PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS =
  "28px minmax(208px, 4.35fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(108px, 0.92fr)";

const rowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE,
  columnGap: 6,
  rowGap: 0,
  alignItems: "center",
  justifyItems: "stretch",
  width: "100%",
  boxSizing: "border-box",
};

const rowGridEmbed: CSSProperties = {
  ...rowGrid,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED,
  columnGap: 10,
};

const rowGridEmbedIcons: CSSProperties = {
  ...rowGrid,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS,
  columnGap: 10,
};

/** Barra de grupo: misma rejilla; contenido en una sola celda ancha. */
const rowGridGroupBar: CSSProperties = {
  display: "grid",
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE,
  columnGap: 6,
  alignItems: "center",
  width: "100%",
  boxSizing: "border-box",
};

const rowGridGroupBarEmbed: CSSProperties = {
  ...rowGridGroupBar,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED,
  columnGap: 10,
};

const rowGridGroupBarEmbedIcons: CSSProperties = {
  ...rowGridGroupBar,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS,
  columnGap: 10,
};

const productTableRowPadding = "3px 8px";
/** Modo hielo: mayor ritmo vertical (inventory / Shopify-like). */
const productTableRowPaddingIce = "6px 10px";
const productRowMinHeight = 32;
const productRowMinHeightIce = 40;
/** Divisor de filas en tema claro: menos ruido que --hostly-line pleno */
const PRODUCTOS_ROW_DIVIDER_ICE = "1px solid var(--hostly-table-divider-faint)";

const productGridPriceCell: CSSProperties = {
  justifySelf: "stretch",
  minWidth: 0,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
};

const rowActionBtn: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 630,
  cursor: "pointer",
  minHeight: 28,
  lineHeight: 1.18,
};

function tieneEscandalloForPlato(p: PlatoCarta, meta: EscandalloMetaMap): boolean {
  if (typeof p.tieneEscandallo === "boolean") return p.tieneEscandallo;
  const sid = p.escandalloSupabaseId;
  if (sid == null) return false;
  return meta.get(sid)?.tieneEscandallo === true;
}

type ProductoEstadoVenta = PlatoCarta & { enCarta?: boolean; isActive?: boolean };

function getPublicationFlags(p: PlatoCarta): {
  isActive: boolean;
  enCarta: boolean;
  status: "onMenu" | "offMenu" | "inactive";
} {
  const raw = p as ProductoEstadoVenta;
  /** Sin campo explícito: el producto cuenta como activo en catálogo; `activo` solo indica visibilidad en carta. */
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  const enCarta = typeof raw.enCarta === "boolean" ? raw.enCarta : raw.activo;
  if (!isActive) return { isActive, enCarta, status: "inactive" };
  if (enCarta) return { isActive, enCarta, status: "onMenu" };
  return { isActive, enCarta, status: "offMenu" };
}

function ProductRowPublicationCell({
  p,
  t,
  embedLight = false,
}: {
  p: PlatoCarta;
  t: (key: string) => string;
  embedLight?: boolean;
}) {
  const { status } = getPublicationFlags(p);
  const label =
    status === "onMenu"
      ? t("productos.statusBadgeOnMenu")
      : status === "offMenu"
        ? t("productos.statusBadgeOffMenu")
        : t("productos.statusBadgeInactive");
  const dotColor =
    status === "onMenu" ? "#22c55e" : status === "offMenu" ? "#d97706" : "#ef4444";
  const tone = embedLight
    ? status === "onMenu"
      ? {
          border: "1px solid rgba(148, 163, 184, 0.11)",
          background: "rgba(248, 250, 252, 0.38)",
          color: "#64748b",
        }
      : status === "offMenu"
        ? {
            border: "1px solid rgba(148, 163, 184, 0.095)",
            background: "rgba(248, 250, 252, 0.28)",
            color: "#64748b",
          }
        : {
            border: "1px solid rgba(148, 163, 184, 0.11)",
            background: "rgba(248, 250, 252, 0.32)",
            color: "#64748b",
          }
    : status === "onMenu"
      ? {
          border: "1px solid rgba(74, 222, 128, 0.22)",
          background: "rgba(34, 197, 94, 0.08)",
          color: "#d1fae5",
        }
      : status === "offMenu"
        ? {
            border: "1px solid rgba(251, 191, 36, 0.2)",
            background: "rgba(245, 158, 11, 0.06)",
            color: "#fef3c7",
          }
        : {
            border: "1px solid rgba(248, 113, 113, 0.2)",
            background: "rgba(239, 68, 68, 0.06)",
            color: "#fecaca",
          };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        padding: "0 1px",
        boxSizing: "border-box",
      }}
    >
      <span
        role="status"
        aria-label={label}
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: embedLight ? "1px 6px" : "2px 7px",
          borderRadius: embedLight ? 6 : 999,
          fontSize: embedLight ? 8 : 9,
          fontWeight: embedLight ? 500 : 600,
          letterSpacing: embedLight ? "0.06em" : "0.04em",
          textTransform: "uppercase",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...tone,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: embedLight ? 4 : 5,
            height: embedLight ? 4 : 5,
            borderRadius: "50%",
            background: dotColor,
            opacity: embedLight ? 0.55 : 1,
            boxShadow: embedLight ? "none" : `0 0 0 1px rgba(15, 23, 42, 0.5)`,
          }}
        />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
    </div>
  );
}

function ProductRowEscandalloCell({
  tiene,
  t,
  embedLight = false,
}: {
  tiene: boolean;
  t: (key: string) => string;
  embedLight?: boolean;
}) {
  const label = tiene ? t("productos.escCon") : t("productos.escSin");
  const escTone = embedLight
    ? tiene
      ? {
          border: "1px solid rgba(148, 163, 184, 0.1)",
          background: "rgba(248, 250, 252, 0.35)",
          color: "#8896a9",
        }
      : {
          border: "1px solid rgba(148, 163, 184, 0.085)",
          background: "rgba(248, 250, 252, 0.28)",
          color: "#8b98ab",
        }
    : tiene
      ? {
          border: "1px solid rgba(148, 163, 184, 0.14)",
          background: "rgba(248, 250, 252, 0.04)",
          color: "#94a3b8",
        }
      : {
          border: "1px solid rgba(71, 85, 105, 0.35)",
          background: "transparent",
          color: "#64748b",
        };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <span
        title={label}
        aria-label={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: embedLight ? 3 : 4,
          padding: embedLight ? "1px 5px" : "2px 6px",
          borderRadius: embedLight ? 5 : 5,
          fontSize: embedLight ? 8 : 9,
          fontWeight: embedLight ? 500 : 600,
          letterSpacing: embedLight ? "0.06em" : "0.05em",
          textTransform: "uppercase",
          maxWidth: "100%",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...escTone,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            flexShrink: 0,
            background: embedLight
              ? tiene
                ? "rgba(148, 163, 184, 0.3)"
                : "rgba(148, 163, 184, 0.16)"
              : tiene
                ? "rgba(148, 163, 184, 0.55)"
                : "rgba(71, 85, 105, 0.65)",
          }}
        />
        {label}
      </span>
    </div>
  );
}

const productRowActionBtnShellLight: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minHeight: 26,
  height: 26,
  padding: "0 6px",
  borderRadius: 6,
  fontSize: 9,
  fontWeight: 520,
  lineHeight: 1,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(255, 255, 255, 0.22)",
  color: "#7b8798",
};

/** Botón icónico hielo (Config → Carta → Productos). */
const productRowIconBtnShellLight: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 26,
  height: 26,
  padding: 0,
  borderRadius: 7,
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(255, 255, 255, 0.22)",
  color: "#7b8798",
};

function RowActionGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

function IconGlCartaPrimary({ status }: { status: "onMenu" | "offMenu" | "inactive" }) {
  if (status === "inactive") {
    return (
      <RowActionGlyph>
        <path d="M13 2L4 14h6l-1.5 8L20 9h-6.5L13 2z" />
      </RowActionGlyph>
    );
  }
  if (status === "onMenu") {
    return (
      <RowActionGlyph strokeWidth={1.55}>
        <circle cx="12" cy="12" r="8.75" />
        <path d="M8 12h8" />
      </RowActionGlyph>
    );
  }
  return (
    <RowActionGlyph>
      <path d="M12 5v14M5 12h14" />
    </RowActionGlyph>
  );
}

function IconGlPencil() {
  return (
    <RowActionGlyph>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </RowActionGlyph>
  );
}

function IconGlChart() {
  return (
    <RowActionGlyph>
      <path d="M4 19V10M12 19V6M16 19v-5M20 19v-2" />
    </RowActionGlyph>
  );
}

function IconGlTrash() {
  return (
    <RowActionGlyph>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
      <path d="M10 11v6M14 11v6" />
    </RowActionGlyph>
  );
}

function ProductRowActions({
  p,
  busyEsc,
  t,
  embedLight = false,
  inventoryIconToolbar = false,
  onEdit,
  onToggleCarta,
  onActivateProduct,
  onEsc,
  onDelete,
}: {
  p: PlatoCarta;
  busyEsc: boolean;
  t: (key: string) => string;
  embedLight?: boolean;
  inventoryIconToolbar?: boolean;
  onEdit: () => void;
  onToggleCarta: () => void;
  onActivateProduct: () => void;
  onEsc: () => void;
  onDelete: () => void;
}) {
  const { status, enCarta } = getPublicationFlags(p);
  const escEnabled = enCarta && !busyEsc;
  const shell = embedLight ? productRowActionBtnShellLight : productRowActionBtnShell;

  const primaryCartaLabel =
    status === "inactive"
      ? t("productos.actionActivateProduct")
      : status === "onMenu"
        ? t("productos.actionQuitarCarta")
        : t("productos.pubEnCarta");

  const primaryCartaTitle =
    status === "inactive"
      ? t("productos.actionActivateProduct")
      : status === "onMenu"
        ? t("productos.actionQuitarCarta")
        : t("productos.actionVolverCarta");

  const primaryCartaStyle: CSSProperties = embedLight
    ? status === "inactive"
      ? {
          ...shell,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "rgba(255, 255, 255, 0.45)",
          color: "#475569",
          fontWeight: 500,
        }
      : status === "onMenu"
        ? {
            ...shell,
            border: "1px solid rgba(148, 163, 184, 0.3)",
            background: "rgba(255, 255, 255, 0.4)",
            color: "#64748b",
            fontWeight: 500,
          }
        : {
            ...shell,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(255, 255, 255, 0.45)",
            color: "#64748b",
            fontWeight: 500,
          }
    : status === "inactive"
      ? {
          ...productRowActionBtnShell,
          border: "1px solid rgba(56, 189, 248, 0.28)",
          background: "rgba(8, 47, 73, 0.32)",
          color: "#bae6fd",
          fontWeight: 600,
        }
      : status === "onMenu"
        ? {
            ...productRowActionBtnShell,
            border: "1px solid rgba(251, 191, 36, 0.28)",
            background: "rgba(245, 158, 11, 0.08)",
            color: "#fde68a",
          }
        : {
            ...productRowActionBtnShell,
            border: "1px solid rgba(74, 222, 128, 0.28)",
            background: "rgba(34, 197, 94, 0.08)",
            color: "#bbf7d0",
          };

  const primaryCartaIconStyle: CSSProperties =
    status === "inactive"
      ? {
          ...productRowIconBtnShellLight,
          border: "1px solid rgba(56, 189, 248, 0.22)",
          background: "rgba(224, 242, 254, 0.55)",
          color: "#0369a1",
        }
      : status === "onMenu"
        ? {
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(251, 191, 36, 0.28)",
            background: "rgba(255, 251, 235, 0.65)",
            color: "#b45309",
          }
        : {
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(74, 222, 128, 0.24)",
            background: "rgba(220, 252, 231, 0.55)",
            color: "#166534",
          };

  const onPrimaryCarta = status === "inactive" ? onActivateProduct : onToggleCarta;

  const escLabel = busyEsc ? t("carta.escPending") : t("carta.actionEscandallo");
  const escTitle =
    busyEsc ? t("carta.escPending") : !enCarta ? t("productos.escNeedCartaHint") : t("carta.actionEscandallo");

  if (inventoryIconToolbar && embedLight) {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 2,
          justifyContent: "flex-end",
          alignItems: "center",
          justifySelf: "stretch",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          onClick={onPrimaryCarta}
          style={primaryCartaIconStyle}
          title={primaryCartaTitle}
          aria-label={primaryCartaTitle}
        >
          <IconGlCartaPrimary status={status} />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          onClick={onEdit}
          style={productRowIconBtnShellLight}
          title={t("carta.actionEdit")}
          aria-label={t("carta.actionEdit")}
        >
          <IconGlPencil />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          disabled={!escEnabled}
          title={escTitle}
          aria-label={escLabel}
          onClick={onEsc}
          style={{
            ...productRowIconBtnShellLight,
            cursor: escEnabled ? "pointer" : "not-allowed",
          }}
        >
          <IconGlChart />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          onClick={onDelete}
          style={{
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(248, 113, 113, 0.22)",
            background: "rgba(254, 242, 242, 0.45)",
            color: "#b91c1c",
          }}
          title={t("common.delete")}
          aria-label={t("common.delete")}
        >
          <IconGlTrash />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 3,
        justifyContent: "flex-end",
        alignItems: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        onClick={onPrimaryCarta}
        style={primaryCartaStyle}
        title={primaryCartaTitle}
        aria-label={primaryCartaTitle}
      >
        {primaryCartaLabel}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        onClick={onEdit}
        style={shell}
        title={t("carta.actionEdit")}
        aria-label={t("carta.actionEdit")}
      >
        {t("carta.actionEdit")}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        disabled={!escEnabled}
        title={escTitle}
        aria-label={escLabel}
        onClick={onEsc}
        style={{
          ...shell,
          cursor: escEnabled ? "pointer" : "not-allowed",
        }}
      >
        {escLabel}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        onClick={onDelete}
        style={{
          ...shell,
          border: embedLight ? "1px solid rgba(148, 163, 184, 0.22)" : "1px solid rgba(248, 113, 113, 0.28)",
          background: embedLight ? "transparent" : "rgba(127, 29, 29, 0.12)",
          color: embedLight ? "#94a3b8" : "#fca5a5",
        }}
        title={t("common.delete")}
        aria-label={t("common.delete")}
      >
        {t("common.delete")}
      </button>
    </div>
  );
}

export type ProductosManagementPageProps = {
  /** Dentro del layout Config (franja superior); el shell usa altura flexible en lugar de 100dvh. */
  lockViewportFillParent?: boolean;
  /** Vista alineada con Configuración: shell claro, tabla y chips legibles sobre fondo global. */
  embedConfigVisual?: boolean;
  /**
   * `/dashboard/productos`: mismo tratamiento visual “hielo” que en Config, manteniendo enlaces a rutas de carta (no a Config).
   */
  dashboardListIceVisual?: boolean;
};

export default function ProductosManagementPage({
  lockViewportFillParent = false,
  embedConfigVisual = false,
  dashboardListIceVisual = false,
}: ProductosManagementPageProps = {}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const emb = Boolean(embedConfigVisual);
  const iceVisual = emb || Boolean(dashboardListIceVisual);
  /** Solo Config → Carta → Productos: menos ruido, prioridad en la tabla */
  const configCartaProductosChrome = emb && iceVisual;
  const iceProductosDataGridStyle = iceVisual ? (configCartaProductosChrome ? rowGridEmbedIcons : rowGridEmbed) : rowGrid;
  const iceProductosGroupBarGridStyle = iceVisual
    ? configCartaProductosChrome
      ? rowGridGroupBarEmbedIcons
      : rowGridGroupBarEmbed
    : rowGridGroupBar;
  const productosTableMinInnerWidthPx =
    iceVisual && configCartaProductosChrome ? PRODUCTOS_TABLE_MIN_WIDTH_EMBED_ICONS_PX : PRODUCTOS_TABLE_MIN_WIDTH_PX;
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<PlatoCarta[]>([]);
  const [meta, setMeta] = useState<EscandalloMetaMap>(new Map());
  const [listFilter, setListFilter] = useState<CartaFilter>("todos");
  const [listSearch, setListSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");
  const [categoryTab, setCategoryTab] = useState<string>("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftTipo, setDraftTipo] = useState<TipoProductoVenta>("plato");
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  const [modifierFamilies, setModifierFamilies] = useState<ModifierFamilyRow[]>([]);
  const [draftCategoriaCartaId, setDraftCategoriaCartaId] = useState<string | null>(null);
  const [draftCartaMenuFamiliaId, setDraftCartaMenuFamiliaId] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCatName, setAddCatName] = useState("");
  const [addCatType, setAddCatType] = useState<CartaCategoriaTipo>("general");
  const [addCatCartaFamiliaId, setAddCatCartaFamiliaId] = useState<string | undefined>(undefined);
  const [addCatSaving, setAddCatSaving] = useState(false);
  const [draftPrecio, setDraftPrecio] = useState("");
  const [draftActivo, setDraftActivo] = useState(true);
  const [draftFoto, setDraftFoto] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftPreparationArea, setDraftPreparationArea] = useState("cocina");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [escNavId, setEscNavId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const nombreInputRef = useRef<HTMLInputElement | null>(null);
  const [drawerSyncing, setDrawerSyncing] = useState(false);

  const persist = useCallback((next: PlatoCarta[]) => {
    setItems(next);
    savePlatos(getBrowserRestauranteId(), next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restauranteId = getBrowserRestauranteId();
      await bootstrapPlatosFromEscandallosIfEmpty(restauranteId);
      if (cancelled) return;
      /** Evita setState en el mismo turno que aún no tiene alternate (React 19 DEV). */
      queueMicrotask(() => {
        if (cancelled) return;
        setItems(loadPlatos(restauranteId));
        setHydrated(true);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    const onChange = () => {
      queueMicrotask(() => {
        if (!alive) return;
        setItems(loadPlatos(getBrowserRestauranteId()));
      });
    };
    window.addEventListener(PLATOS_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PLATOS_CHANGED_EVENT, onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const rid = getBrowserRestauranteId();
    void Promise.all([
      fetchCartaCategorias(rid),
      fetchCartaFamilias(rid),
      fetchModifierFamiliesForRestaurante(rid),
    ]).then(([list, fams, mods]) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (cancelled) return;
        setCartaCategorias(list);
        setCartaFamilias(fams);
        setModifierFamilies(mods);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const onCat = () => {
      const rid = getBrowserRestauranteId();
      void Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
      ]).then(([list, fams, mods]) => {
        if (!alive) return;
        queueMicrotask(() => {
          if (!alive) return;
          setCartaCategorias(list);
          setCartaFamilias(fams);
          setModifierFamilies(mods);
        });
      });
    };
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    return () => {
      alive = false;
      window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = items.map((p) => p.escandalloSupabaseId).filter((x): x is number => x != null);
    if (ids.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setMeta(new Map());
      });
      return () => {
        cancelled = true;
      };
    }
    void fetchEscandalloMetaForIds(ids).then((m) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (!cancelled) setMeta(m);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const stats = useMemo(() => {
    let activos = 0;
    let inactivos = 0;
    let conEsc = 0;
    let sinEsc = 0;
    for (const p of items) {
      if (p.activo) activos += 1;
      else inactivos += 1;
      if (tieneEscandalloForPlato(p, meta)) conEsc += 1;
      else sinEsc += 1;
    }
    return { activos, inactivos, conEsc, sinEsc, total: items.length };
  }, [items, meta]);

  const filteredSorted = useMemo(() => {
    let rows = items;
    if (listFilter === "activos") rows = rows.filter((p) => p.activo);
    else if (listFilter === "inactivos") rows = rows.filter((p) => !p.activo);
    else if (listFilter === "conEscandallo") rows = rows.filter((p) => tieneEscandalloForPlato(p, meta));
    else if (listFilter === "sinEscandallo") rows = rows.filter((p) => !tieneEscandalloForPlato(p, meta));

    return [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }));
  }, [items, listFilter, meta]);

  const tabOptions = useMemo(() => {
    const sorted = [...cartaCategorias].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    const out: { id: string; label: string }[] = [{ id: "__all__", label: t("cartaVisual.categoryAll") }];
    for (const c of sorted) {
      out.push({ id: c.id, label: c.name });
    }
    let hasUncategorized = false;
    for (const p of filteredSorted) {
      if (!p.categoriaCartaId && !(p.categoria ?? "").trim()) hasUncategorized = true;
    }
    if (hasUncategorized) out.push({ id: "__uncat__", label: t("cartaCategories.filterUncat") });
    return out;
  }, [cartaCategorias, filteredSorted, t]);

  useEffect(() => {
    let alive = true;
    if (!tabOptions.some((o) => o.id === categoryTab)) {
      queueMicrotask(() => {
        if (!alive) return;
        setCategoryTab("__all__");
      });
    }
    return () => {
      alive = false;
    };
  }, [tabOptions, categoryTab]);

  const tabFilteredSorted = useMemo(() => {
    if (categoryTab === "__all__") return filteredSorted;
    if (categoryTab === "__uncat__") {
      return filteredSorted.filter((p) => !p.categoriaCartaId && !(p.categoria ?? "").trim());
    }
    const cat = cartaCategorias.find((c) => c.id === categoryTab);
    return filteredSorted.filter((p) => {
      if (p.categoriaCartaId === categoryTab) return true;
      if (cat && !p.categoriaCartaId) {
        const a = normCatKey(p.categoria ?? "");
        const b = normCatKey(cat.name);
        return a === b && a !== "";
      }
      return false;
    });
  }, [filteredSorted, categoryTab, cartaCategorias]);

  const displayed = useMemo(() => {
    const q = normalizeForSearch(listSearch);
    if (!q) return tabFilteredSorted;
    return tabFilteredSorted.filter(
      (p) =>
        normalizeForSearch(p.nombre).includes(q) ||
        normalizeForSearch(p.categoria).includes(q) ||
        normalizeForSearch(p.tipoVenta).includes(q) ||
        normalizeForSearch(labelTipoVenta(t, p.tipoVenta)).includes(q),
    );
  }, [tabFilteredSorted, listSearch, t]);

  useEffect(() => {
    let alive = true;
    const valid = new Set(items.map((p) => p.id));
    queueMicrotask(() => {
      if (!alive) return;
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => valid.has(id)));
        return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
      });
    });
    return () => {
      alive = false;
    };
  }, [items]);

  useLayoutEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    if (displayed.length === 0) {
      el.indeterminate = false;
      return;
    }
    const nSel = displayed.filter((p) => selectedIds.has(p.id)).length;
    el.indeterminate = nSel > 0 && nSel < displayed.length;
  }, [displayed, selectedIds]);

  const toggleRowSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllDisplayed = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = displayed.length > 0 && displayed.every((p) => next.has(p.id));
      if (allOn) {
        for (const p of displayed) next.delete(p.id);
      } else {
        for (const p of displayed) next.add(p.id);
      }
      return next;
    });
  }, [displayed]);

  const bulkApplyToIds = useCallback(
    (ids: Set<string>, patch: Partial<{ activo: boolean; isActive: boolean }>) => {
      if (ids.size === 0) return;
      const now = new Date().toISOString();
      const next = items.map((p) =>
        ids.has(p.id) ? ({ ...p, ...patch, updatedAt: now } as PlatoCarta & { isActive?: boolean }) : p,
      );
      persist(next as PlatoCarta[]);
      void Promise.all(
        [...ids].map((id) => {
          const pl = next.find((x) => x.id === id);
          return pl ? mirrorPlatoToEscandalloRow(pl) : Promise.resolve({ error: null });
        }),
      );
      setNotice(t("carta.noticeSaved"));
      window.setTimeout(() => setNotice(null), 2200);
    },
    [items, persist, t],
  );

  const bulkSelectionBreakdown = useMemo(() => {
    const idsFuera = new Set<string>();
    const idsEnCarta = new Set<string>();
    const idsInactivos = new Set<string>();
    const idsActivosVenta = new Set<string>();
    for (const p of items) {
      if (!selectedIds.has(p.id)) continue;
      const f = getPublicationFlags(p);
      if (!f.isActive) {
        idsInactivos.add(p.id);
        continue;
      }
      idsActivosVenta.add(p.id);
      if (f.enCarta) idsEnCarta.add(p.id);
      else idsFuera.add(p.id);
    }
    return {
      countFueraCarta: idsFuera.size,
      countEnCarta: idsEnCarta.size,
      countInactivos: idsInactivos.size,
      countActivosVenta: idsActivosVenta.size,
      idsFuera,
      idsEnCarta,
      idsInactivos,
      idsActivosVenta,
    };
  }, [items, selectedIds]);

  const groupedByCategoria = useMemo(() => {
    const sections = buildCartaGroupedSections(displayed, cartaCategorias, {
      activeProductsOnly: false,
      activeCategoriesOnly: false,
    });
    return sections.map((s) => ({ categoria: s.label, sectionKey: s.sectionKey, items: s.items }));
  }, [displayed, cartaCategorias]);

  const kpiPills = useMemo(
    () => [
      { key: "act", label: t("carta.kpiActivos"), value: String(stats.activos) },
      { key: "ina", label: t("carta.kpiInactivos"), value: String(stats.inactivos) },
      { key: "ce", label: t("carta.kpiConEsc"), value: String(stats.conEsc) },
      { key: "se", label: t("carta.kpiSinEsc"), value: String(stats.sinEsc) },
    ],
    [t, stats],
  );

  const rowNombreStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowNombreStyle,
            color: "var(--hostly-navy-deep)",
            fontWeight: 750,
            fontSize: 15,
            lineHeight: 1.34,
            letterSpacing: "-0.024em",
          }
        : productRowNombreStyle,
    [iceVisual],
  );
  const rowPrecioStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowPrecioStyle,
            color: "var(--hostly-navy-deep)",
            fontWeight: 680,
            fontSize: 13,
            lineHeight: 1.3,
          }
        : productRowPrecioStyle,
    [iceVisual],
  );
  const rowTipoStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowTipoStyle,
            fontSize: 9,
            fontWeight: 540,
            letterSpacing: "0.05em",
            color: "color-mix(in srgb, var(--hostly-ink-muted) 94%, var(--hostly-ink))",
          }
        : productRowTipoStyle,
    [iceVisual],
  );
  const rowCategoriaStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowCategoriaStyle,
            fontSize: 9.5,
            fontWeight: 420,
            color: "color-mix(in srgb, var(--hostly-ink-muted) 92%, var(--hostly-ink))",
          }
        : productRowCategoriaStyle,
    [iceVisual],
  );
  const colHeadStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...colHeadStyle,
            fontSize: 8.5,
            fontWeight: 540,
            letterSpacing: "0.13em",
            color: "var(--hostly-ink-faint)",
            padding: "5px 4px",
          }
        : colHeadStyle,
    [iceVisual],
  );

  const editingPlato = useMemo(() => (editingId ? (items.find((p) => p.id === editingId) ?? null) : null), [editingId, items]);
  const editingHasEscandallo = useMemo(() => (editingPlato ? tieneEscandalloForPlato(editingPlato, meta) : false), [editingPlato, meta]);

  const categoriasForForm = useMemo(
    () => cartaCategoriasForTipoYFamiliaFiltro(cartaCategorias, draftTipo, draftCartaMenuFamiliaId),
    [cartaCategorias, draftTipo, draftCartaMenuFamiliaId],
  );

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeForm();
      }
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => nombreInputRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [formOpen, closeForm]);

  const metricNum: CSSProperties = {
    ...tabularFigures,
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: iceVisual ? "#0f172a" : "#f8fafc",
    lineHeight: 1.1,
  };

  function openCreate() {
    setEditingId(null);
    setDraftNombre("");
    setDraftTipo("plato");
    setDraftCategoriaCartaId(null);
    setDraftCartaMenuFamiliaId(null);
    setDraftPrecio("");
    setDraftActivo(true);
    setDraftFoto("");
    setDraftDesc("");
    setDraftPreparationArea("cocina");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: PlatoCarta) {
    setEditingId(p.id);
    setDraftNombre(p.nombre);
    setDraftTipo(p.tipoVenta);
    const tid = p.categoriaCartaId ?? null;
    const cat = tid ? cartaCategorias.find((c) => c.id === tid) : undefined;
    if (!tid) setDraftCategoriaCartaId(null);
    else if (!cat) setDraftCategoriaCartaId(tid);
    else setDraftCategoriaCartaId(isCartaCategoriaCompatibleWithTipoProducto(cat, p.tipoVenta) ? tid : null);
    if (cat && isCartaCategoriaCompatibleWithTipoProducto(cat, p.tipoVenta)) {
      setDraftCartaMenuFamiliaId(
        cat.cartaFamiliaId?.trim() ? cat.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
      );
    } else if (tid && !cat) {
      const cf = p.cartaFamiliaId?.trim();
      setDraftCartaMenuFamiliaId(cf ? cf : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED);
    } else {
      setDraftCartaMenuFamiliaId(null);
    }
    setDraftPrecio(String(p.precioVenta));
    setDraftActivo(p.activo);
    setDraftFoto(p.fotoUrl ?? "");
    setDraftDesc(p.descripcion ?? "");
    setDraftPreparationArea((p.preparationArea ?? "cocina").trim() || "cocina");
    setFormError(null);
    setFormOpen(true);
  }

  function parsePrecio(s: string): number | null {
    const x = s.trim().replace(",", ".");
    if (x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function submitForm() {
    setFormError(null);
    const nombre = draftNombre.trim();
    if (!nombre) {
      setFormError(t("carta.errorNombre"));
      return;
    }
    const preparationArea = draftPreparationArea.trim();
    if (!preparationArea) {
      setFormError("Selecciona un área de preparación.");
      return;
    }
    const precioVenta = parsePrecio(draftPrecio);
    if (precioVenta == null) {
      setFormError(t("carta.errorPrecio"));
      return;
    }

    const restauranteId = getBrowserRestauranteId();
    const now = new Date().toISOString();
    const selectedCat = draftCategoriaCartaId ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId) : undefined;
    if (selectedCat && !isCartaCategoriaCompatibleWithTipoProducto(selectedCat, draftTipo)) {
      setFormError(t("carta.errorCategoriaTipo"));
      return;
    }
    const categoria = selectedCat ? selectedCat.name : "";
    const categoriaCartaIdPatch = selectedCat ? selectedCat.id : undefined;
    const cartaFamiliaIdPatch = selectedCat?.cartaFamiliaId?.trim() || undefined;
    const selMenuFamId = selectedCat?.cartaFamiliaId?.trim();
    const menuFamName =
      selMenuFamId != null && selMenuFamId !== ""
        ? cartaFamilias.find((x) => x.id === selMenuFamId)?.name
        : undefined;

    if (editingId) {
      const next = items.map((p) => {
        if (p.id !== editingId) return p;
        let patched: PlatoCarta = {
          ...p,
          nombre,
          preparationArea,
          tipoVenta: draftTipo,
          categoria,
          categoriaCartaId: categoriaCartaIdPatch,
          cartaFamiliaId: cartaFamiliaIdPatch,
          precioVenta,
          activo: draftActivo,
          fotoUrl: draftFoto.trim() || undefined,
          descripcion: draftDesc.trim() || undefined,
          updatedAt: now,
        };
        patched = applyDefaultModifierFamilyIfEligible(patched, {
          selectedCartaCategoria: selectedCat,
          cartaMenuFamiliaName: menuFamName,
          modifierFamilies,
        });
        return patched;
      });
      persist(next);
      const updated = next.find((p) => p.id === editingId);
      fireAndForgetSyncCatalogoCategoria(restauranteId, updated?.escandalloSupabaseId ?? null, categoria);
      if (updated?.escandalloSupabaseId != null) {
        const { error: mirErr } = await mirrorPlatoToEscandalloRow(updated);
        if (mirErr) {
          setFormError(mirErr);
          return;
        }
      }
      setNotice(t("carta.noticeSaved"));
    } else {
      let nuevo = createPlatoDraft(restauranteId, {
        nombre,
        preparationArea,
        tipoVenta: draftTipo,
        categoria,
        categoriaCartaId: categoriaCartaIdPatch,
        cartaFamiliaId: cartaFamiliaIdPatch,
        precioVenta,
        activo: draftActivo,
        fotoUrl: draftFoto.trim() || undefined,
        descripcion: draftDesc.trim() || undefined,
      });
      nuevo = applyDefaultModifierFamilyIfEligible(nuevo, {
        selectedCartaCategoria: selectedCat,
        cartaMenuFamiliaName: menuFamName,
        modifierFamilies,
      });
      const nextLocal = [...items, nuevo];
      persist(nextLocal);
      setNotice(t("carta.noticeAdded"));
      if (nuevo.activo) {
        setDrawerSyncing(true);
        const ensured = await ensureEscandalloRowsForPlatos(nextLocal);
        setDrawerSyncing(false);
        if (ensured.error) {
          setFormError(t("carta.errorSyncEsc"));
          return;
        }
        if (ensured.next !== nextLocal) {
          savePlatos(restauranteId, ensured.next);
          setItems(ensured.next);
        }
      }
    }
    closeForm();
    window.setTimeout(() => setNotice(null), 3200);
  }

  async function saveQuickCategory() {
    const name = addCatName.trim();
    if (!name) return;
    setAddCatSaving(true);
    const res = await createCartaCategoriaApi(getBrowserRestauranteId(), {
      name,
      type: addCatType,
      cartaFamiliaId: addCatCartaFamiliaId,
      isActive: true,
    });
    setAddCatSaving(false);
    if (res.ok) {
      const rid = getBrowserRestauranteId();
      const [list, fams, mods] = await Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
      ]);
      setCartaCategorias(list);
      setCartaFamilias(fams);
      setModifierFamilies(mods);
      setDraftCategoriaCartaId(res.item.id);
      if (res.item.cartaFamiliaId?.trim()) {
        setDraftCartaMenuFamiliaId(res.item.cartaFamiliaId.trim());
      }
      setAddCategoryOpen(false);
      setAddCatName("");
      setAddCatType(defaultCartaCategoriaTipoForTipoProducto(draftTipo));
      setAddCatCartaFamiliaId(undefined);
    }
  }

  function toggleActivo(p: PlatoCarta) {
    const now = new Date().toISOString();
    const next = items.map((x) => (x.id === p.id ? { ...x, activo: !x.activo, updatedAt: now } : x));
    persist(next);
    void (async () => {
      const pl = next.find((x) => x.id === p.id);
      if (pl) await mirrorPlatoToEscandalloRow(pl);
    })();
    setNotice(t("carta.noticeSaved"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  /** Reactiva venta (`isActive`); no cambia visibilidad en carta. Campo opcional en persistencia JSON. */
  function activateProducto(p: PlatoCarta) {
    const now = new Date().toISOString();
    const next = items.map((x) =>
      x.id === p.id ? ({ ...x, isActive: true, updatedAt: now } as PlatoCarta & { isActive?: boolean }) : x,
    );
    persist(next as PlatoCarta[]);
    void (async () => {
      const pl = next.find((x) => x.id === p.id);
      if (pl) await mirrorPlatoToEscandalloRow(pl);
    })();
    setNotice(t("carta.noticeSaved"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function goToEscandallo(p: PlatoCarta) {
    if (!p.activo) return;
    setFormError(null);
    setEscNavId(p.id);
    try {
      const restauranteId = getBrowserRestauranteId();
      let platos = loadPlatos(restauranteId);
      const { next, error } = await ensureEscandalloRowsForPlatos(platos);
      if (error) {
        setFormError(t("carta.errorSyncEsc"));
        return;
      }
      if (next !== platos) {
        savePlatos(restauranteId, next);
        setItems(next);
        platos = next;
      }
      const linked = platos.find((x) => x.id === p.id);
      const sid = linked?.escandalloSupabaseId;
      if (sid == null) {
        setFormError(t("carta.errorSyncEsc"));
        return;
      }
      router.push(`/dashboard/escandallos/${sid}`);
    } finally {
      setEscNavId(null);
    }
  }

  function deleteProducto(p: PlatoCarta) {
    const ok = window.confirm(`¿Borrar "${p.nombre}" del catálogo? Esta acción no se puede deshacer.`);
    if (!ok) return;
    const next = items.filter((x) => x.id !== p.id);
    persist(next);
    if (editingId === p.id) {
      setFormOpen(false);
      setEditingId(null);
      setFormError(null);
    }
    setNotice("Producto borrado.");
    window.setTimeout(() => setNotice(null), 2200);
  }

  const iceToolbarFilterSpecs = [
    { id: "todos" as const, label: t("carta.filterAll") },
    { id: "activos" as const, label: t("carta.filterActive") },
    { id: "inactivos" as const, label: t("carta.filterInactive") },
    { id: "conEscandallo" as const, label: t("carta.filterConEsc") },
    { id: "sinEscandallo" as const, label: t("carta.filterSinEsc") },
  ] as const;

  /** UI only: filtros rápidos hielo; `cfgMergedStripe` = barra ultra compacta (config carta embed). */
  function iceToolbarFilterButtons(cfgMergedStripe: boolean): ReactNode {
    const dense = cfgMergedStripe;
    return iceToolbarFilterSpecs.map((f) => {
      const active = listFilter === f.id;
      const passiveBorder =
        dense
          ? "1px solid rgba(148, 163, 184, 0.16)"
          : configCartaProductosChrome
            ? "1px solid rgba(148, 163, 184, 0.18)"
            : iceVisual
              ? "1px solid var(--hostly-line)"
              : "1px solid #334155";
      const inactiveBg =
        dense
          ? "rgba(255, 255, 255, 0.42)"
          : configCartaProductosChrome && iceVisual
            ? "rgba(255, 255, 255, 0.5)"
            : iceVisual
              ? "#fff"
              : "#0f172a";
      const inactiveInk =
        dense ? "var(--hostly-ink-muted)" : configCartaProductosChrome ? "var(--hostly-ink-muted)" : "#94a3b8";
      return (
        <button
          key={f.id}
          type="button"
          onClick={() => setListFilter(f.id)}
          style={{
            border: active ? "1px solid rgba(34, 197, 94, 0.55)" : passiveBorder,
            background: active
              ? iceVisual
                ? "rgba(220, 252, 231, 0.95)"
                : "rgba(34, 197, 94, 0.18)"
              : inactiveBg,
            color: active ? (iceVisual ? "#166534" : "#ecfdf5") : inactiveInk,
            padding: dense ? "3px 7px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: active ? 700 : dense ? 640 : configCartaProductosChrome ? 650 : 700,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
          }}
        >
          {f.label}
        </button>
      );
    });
  }

  function iceToolbarViewControls(cfgMergedStripe: boolean): ReactNode {
    const dense = cfgMergedStripe;
    const shellStyle: CSSProperties = {
      display: "flex",
      gap: dense ? 4 : configCartaProductosChrome ? 5 : 6,
      alignItems: "center",
      flexWrap: "wrap",
      flexShrink: 0,
      ...(dense ? {} : { marginLeft: "auto" }),
    };
    return (
      <span style={shellStyle}>
        {!dense ? (
          <span
            style={{
              fontSize: configCartaProductosChrome ? 9 : 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            Vista
          </span>
        ) : (
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#94a3b8",
              opacity: 0.85,
            }}
          >
            Vista
          </span>
        )}
        <button
          type="button"
          onClick={() => setViewMode("grouped")}
          style={{
            border:
              viewMode === "grouped"
                ? "1px solid rgba(56, 189, 248, 0.55)"
                : dense
                  ? "1px solid rgba(148, 163, 184, 0.16)"
                  : configCartaProductosChrome
                    ? "1px solid rgba(148, 163, 184, 0.18)"
                    : iceVisual
                      ? "1px solid var(--hostly-line)"
                      : "1px solid #334155",
            background:
              viewMode === "grouped"
                ? iceVisual
                  ? "rgba(224, 242, 254, 0.95)"
                  : "rgba(14, 165, 233, 0.14)"
                : dense && iceVisual
                  ? "rgba(255, 255, 255, 0.42)"
                  : configCartaProductosChrome && iceVisual
                    ? "rgba(255, 255, 255, 0.5)"
                    : iceVisual
                      ? "#fff"
                      : "#0f172a",
            color:
              viewMode === "grouped"
                ? iceVisual
                  ? "#0369a1"
                  : "#bae6fd"
                : dense && iceVisual
                  ? "var(--hostly-ink-muted)"
                  : configCartaProductosChrome
                    ? "var(--hostly-ink-muted)"
                    : "#94a3b8",
            padding: dense ? "3px 8px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: dense ? 720 : 800,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
            whiteSpace: "nowrap",
          }}
        >
          Vista agrupada
        </button>
        <button
          type="button"
          onClick={() => setViewMode("list")}
          style={{
            border:
              viewMode === "list"
                ? "1px solid rgba(56, 189, 248, 0.55)"
                : dense
                  ? "1px solid rgba(148, 163, 184, 0.16)"
                  : configCartaProductosChrome
                    ? "1px solid rgba(148, 163, 184, 0.18)"
                    : iceVisual
                      ? "1px solid var(--hostly-line)"
                      : "1px solid #334155",
            background:
              viewMode === "list"
                ? iceVisual
                  ? "rgba(224, 242, 254, 0.95)"
                  : "rgba(14, 165, 233, 0.14)"
                : dense && iceVisual
                  ? "rgba(255, 255, 255, 0.42)"
                  : configCartaProductosChrome && iceVisual
                    ? "rgba(255, 255, 255, 0.5)"
                    : iceVisual
                      ? "#fff"
                      : "#0f172a",
            color:
              viewMode === "list"
                ? iceVisual
                  ? "#0369a1"
                  : "#bae6fd"
                : dense && iceVisual
                  ? "var(--hostly-ink-muted)"
                  : configCartaProductosChrome
                    ? "var(--hostly-ink-muted)"
                    : "#94a3b8",
            padding: dense ? "3px 8px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: dense ? 720 : 800,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
            whiteSpace: "nowrap",
          }}
        >
          Vista lista
        </button>
      </span>
    );
  }

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("productos.title")}
        subtitle={t("productos.loadingSubtitle")}
        maxWidth={PRODUCTOS_SHELL_MAX_WIDTH}
        compactLayout
        operationalFocus
        denseWorkbench
        lockViewport
        lockViewportFillParent={lockViewportFillParent}
        shellSurface={iceVisual ? "configLight" : "default"}
        denseInventoryHeader={emb}
      >
        <p style={{ color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: productosTableInteractionStyles }} />
      <ModulePageShell
      title={t("productos.title")}
      subtitle={t("productos.subtitle")}
      maxWidth={PRODUCTOS_SHELL_MAX_WIDTH}
      compactLayout
      operationalFocus
      denseWorkbench
      lockViewport
      lockViewportFillParent={lockViewportFillParent}
      shellSurface={iceVisual ? "configLight" : "default"}
      denseInventoryHeader={emb}
      headerBelow={
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: configCartaProductosChrome ? 4 : 8,
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <nav
            aria-label={t("productos.subtitle")}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: configCartaProductosChrome ? 3 : 6,
              minWidth: 0,
              flex: "1 1 200px",
            }}
          >
            <Link
              href={emb ? "/dashboard/configuracion/carta/categorias" : "/dashboard/carta/categorias"}
              style={{
                border: iceVisual ? "1px solid var(--hostly-line)" : "1px solid rgba(148, 163, 184, 0.14)",
                background: iceVisual ? "rgba(255,255,255,0.92)" : "rgba(15, 23, 42, 0.28)",
                color: iceVisual ? "#475569" : "#94a3b8",
                padding: configCartaProductosChrome ? "3px 8px" : "5px 10px",
                borderRadius: configCartaProductosChrome ? 6 : 8,
                fontWeight: 600,
                fontSize: configCartaProductosChrome ? 9 : 11,
                lineHeight: configCartaProductosChrome ? 1.08 : 1.2,
                minHeight: configCartaProductosChrome ? 26 : 30,
                whiteSpace: "nowrap",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                letterSpacing: "-0.01em",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              {t("cartaCategories.manageLink")}
            </Link>
            <button
              type="button"
              onClick={() =>
                router.push(emb ? "/dashboard/configuracion/carta/modificadores" : "/dashboard/carta/modificadores")
              }
              style={{
                border: iceVisual ? "1px solid var(--hostly-line)" : "1px solid rgba(148, 163, 184, 0.14)",
                background: iceVisual ? "rgba(255,255,255,0.92)" : "rgba(15, 23, 42, 0.28)",
                color: iceVisual ? "#475569" : "#94a3b8",
                padding: configCartaProductosChrome ? "3px 8px" : "5px 10px",
                borderRadius: configCartaProductosChrome ? 6 : 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: configCartaProductosChrome ? 9 : 11,
                lineHeight: configCartaProductosChrome ? 1.08 : 1.2,
                minHeight: configCartaProductosChrome ? 26 : 30,
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              {t("carta.ctaModifiers")}
            </button>
          </nav>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: configCartaProductosChrome ? 5 : 8,
              minWidth: 0,
              marginLeft: "auto",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(emb ? "/dashboard/configuracion/carta/importacion" : "/dashboard/carta/importar");
              }}
              style={
                configCartaProductosChrome
                  ? {
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "transparent",
                      color: "var(--hostly-ink-muted)",
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: 9,
                      lineHeight: 1.1,
                      minHeight: 26,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }
                  : {
                      border: iceVisual ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(251, 191, 36, 0.22)",
                      background: iceVisual ? "rgba(255, 251, 235, 0.95)" : "rgba(120, 53, 15, 0.12)",
                      color: iceVisual ? "#92400e" : "#fcd34d",
                      padding: "5px 11px",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 11,
                      lineHeight: 1.2,
                      minHeight: 30,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }
              }
            >
              {t("carta.ctaImportMenu")}
            </button>
            <button
              type="button"
              onClick={openCreate}
              style={
                configCartaProductosChrome
                  ? {
                      border: "1px solid rgba(34, 197, 94, 0.5)",
                      background: "rgba(220, 252, 231, 0.98)",
                      color: "#15803d",
                      padding: "5px 12px",
                      borderRadius: 8,
                      fontWeight: 760,
                      cursor: "pointer",
                      fontSize: 11,
                      lineHeight: 1.15,
                      minHeight: 28,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.02em",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                    }
                  : {
                      border: iceVisual ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(34, 197, 94, 0.42)",
                      background: iceVisual ? "rgba(220, 252, 231, 0.9)" : "rgba(6, 78, 59, 0.22)",
                      color: iceVisual ? "#166534" : "#bbf7d0",
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1.2,
                      minHeight: 30,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }
              }
            >
              {t("carta.ctaNew")}
            </button>
          </div>
        </div>
      }
    >
      <HostlySection
        stack="sm"
        className={
          iceVisual
            ? `hostly-productos-config-skin min-h-0 min-w-0 flex-1 overflow-hidden${configCartaProductosChrome ? " !gap-1" : ""}`
            : "min-h-0 min-w-0 flex-1 overflow-hidden"
        }
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
        }}
      >
        {notice ? (
          <div
            style={{
              flexShrink: 0,
              padding: configCartaProductosChrome ? "5px 8px" : "8px 11px",
              borderRadius: 8,
              background: iceVisual ? "rgba(220, 252, 231, 0.85)" : "rgba(34, 197, 94, 0.12)",
              border: iceVisual ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(34, 197, 94, 0.3)",
              color: iceVisual ? "#166534" : "#bbf7d0",
              fontSize: configCartaProductosChrome ? 11 : 13,
              lineHeight: 1.32,
            }}
          >
            {notice}
          </div>
        ) : null}

        {formError && !formOpen ? (
          <div
            style={{
              flexShrink: 0,
              padding: configCartaProductosChrome ? "5px 8px" : "8px 11px",
              borderRadius: 8,
              background: iceVisual ? "rgba(254, 242, 242, 0.95)" : "rgba(248, 113, 113, 0.12)",
              border: iceVisual ? "1px solid rgba(248, 113, 113, 0.4)" : "1px solid rgba(248, 113, 113, 0.35)",
              color: iceVisual ? "#b91c1c" : "#fecaca",
              fontSize: configCartaProductosChrome ? 11 : 13,
            }}
          >
            {formError}
          </div>
        ) : null}

        {iceVisual ? (
          configCartaProductosChrome ? (
            <div
              aria-label="Indicadores de catálogo"
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-px border-b border-[rgba(148,163,184,0.16)] px-0.5 pb-px pt-0"
              style={{ color: "var(--hostly-ink-muted)" }}
            >
              {kpiPills.map((m, i) => (
                <span key={m.key} className="inline-flex items-baseline gap-0.5">
                  {i > 0 ? (
                    <span className="select-none opacity-[0.28]" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span className="text-[7px] font-bold uppercase tracking-[0.1em] opacity-[0.78]">{m.label}</span>
                  <span
                    className="tabular-nums text-[11px] font-semibold leading-none"
                    style={{ color: "var(--hostly-ink-strong)" }}
                  >
                    {m.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div
              className="grid shrink-0 gap-1.5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}
            >
              {kpiPills.map((m) => (
                <HostlyKpiCard key={m.key} title={m.label} value={m.value} className="px-3 py-2" />
              ))}
            </div>
          )
        ) : (
          <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 2 }}>
            {kpiPills.map((m) => (
              <span
                key={m.key}
                style={{
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "baseline",
                  padding: "4px 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(51, 65, 85, 0.65)",
                  background: "rgba(15, 23, 42, 0.28)",
                  minHeight: 26,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                >
                  {m.label}
                </span>
                <span style={{ ...metricNum, fontSize: 14, lineHeight: 1, color: "#e2e8f0" }}>{m.value}</span>
              </span>
            ))}
          </div>
        )}

        <ProductosTableChrome iceVisual={iceVisual} embedFlatChrome={configCartaProductosChrome}>
          {iceVisual ? (
            configCartaProductosChrome ? (
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                  rowGap: 3,
                  padding: "2px 4px",
                  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 5,
                    minWidth: 0,
                    flex: "1 1 min(520px, 100%)",
                    rowGap: 3,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      gap: "2px 8px",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 750,
                        letterSpacing: "-0.02em",
                        color: "var(--hostly-ink-strong)",
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("carta.listTitle")}
                    </span>
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("carta.listCount", { shown: displayed.length, total: items.length })}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    style={{
                      opacity: 0.16,
                      color: "#475569",
                      fontWeight: 900,
                      userSelect: "none",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    ·
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#94a3b8",
                      flexShrink: 0,
                    }}
                  >
                    {t("stock.filterHint")}
                  </span>
                  {iceToolbarFilterButtons(true)}
                </div>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("carta.searchPlaceholder")}
                  aria-label={t("carta.searchPlaceholder")}
                  style={{
                    minWidth: 116,
                    flex: "1 1 200px",
                    maxWidth: 420,
                    padding: "3px 9px",
                    borderRadius: 999,
                    border: "1px solid rgba(148, 163, 184, 0.26)",
                    background: "var(--hostly-surface-page-soft)",
                    color: "var(--hostly-ink-strong)",
                    fontSize: 11,
                    outline: "none",
                    boxSizing: "border-box",
                    minHeight: 24,
                  }}
                />
                {iceToolbarViewControls(true)}
              </div>
            ) : (
            <HostlySectionHeader
              title={t("carta.listTitle")}
              description={t("carta.listCount", { shown: displayed.length, total: items.length })}
              descriptionClassName="!text-[10px] !font-semibold !leading-snug !m-0"
              className="shrink-0 border-b border-[var(--hostly-line)] px-1.5 py-0.5"
            >
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("carta.searchPlaceholder")}
                aria-label={t("carta.searchPlaceholder")}
                style={{
                  minWidth: 160,
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: "220px",
                  maxWidth: 360,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-page-soft)",
                  color: "var(--hostly-ink-strong)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                  minHeight: 32,
                }}
              />
            </HostlySectionHeader>
            )
          ) : (
          <div
            style={{
              flexShrink: 0,
              padding: "3px 6px",
              borderBottom: "1px solid #334155",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 200px" }}>
              <h2 style={{ ...OPER_PRIMARY_SECTION_TITLE, fontSize: "clamp(13px, 1.35vw, 16px)", lineHeight: 1.06 }}>{t("carta.listTitle")}</h2>
              <p style={{ ...OPER_PRIMARY_COUNT_META, margin: "1px 0 0", fontSize: 10 }}>{t("carta.listCount", { shown: displayed.length, total: items.length })}</p>
            </div>
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={t("carta.searchPlaceholder")}
              aria-label={t("carta.searchPlaceholder")}
              style={{
                minWidth: 160,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: "220px",
                maxWidth: 360,
                padding: "6px 11px",
                borderRadius: 999,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "#f8fafc",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                minHeight: 34,
              }}
            />
          </div>
          )}

          {!configCartaProductosChrome ? (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 5,
              padding: "2px 5px",
              alignItems: "center",
              borderBottom: iceVisual ? "1px solid var(--hostly-line)" : "1px solid #334155",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                marginRight: 2,
              }}
            >
              {t("stock.filterHint")}
            </span>
            {iceToolbarFilterButtons(false)}
            {iceToolbarViewControls(false)}
          </div>
          ) : null}

          <div
            style={{
              flexShrink: 0,
              padding: configCartaProductosChrome ? "1px 3px" : "1px 5px 2px",
              borderBottom: iceVisual
                ? configCartaProductosChrome
                  ? "1px solid rgba(148, 163, 184, 0.2)"
                  : "1px solid var(--hostly-line)"
                : "1px solid rgba(51, 65, 85, 0.75)",
              display: "flex",
              gap: configCartaProductosChrome ? 4 : 6,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
            aria-label="Pestañas de categoría"
          >
            {tabOptions
              .filter((tab) => tab.id !== "__all__")
              .map((tab) => {
              const active = categoryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryTab(tab.id)}
                  style={{
                    flexShrink: 0,
                    border: active
                      ? "1px solid rgba(56, 189, 248, 0.55)"
                      : configCartaProductosChrome
                        ? "1px solid rgba(148, 163, 184, 0.18)"
                        : iceVisual
                          ? "1px solid var(--hostly-line)"
                          : "1px solid rgba(51, 65, 85, 0.8)",
                    background: active
                      ? iceVisual
                        ? "rgba(224, 242, 254, 0.95)"
                        : "rgba(8,47,73,0.35)"
                      : configCartaProductosChrome && iceVisual
                        ? "rgba(255, 255, 255, 0.5)"
                        : iceVisual
                          ? "rgba(248,250,252,0.9)"
                          : "rgba(2,6,23,0.12)",
                    color: active
                      ? iceVisual
                        ? "#0369a1"
                        : "#bae6fd"
                      : configCartaProductosChrome
                        ? "var(--hostly-ink-muted)"
                        : "#94a3b8",
                    padding: configCartaProductosChrome ? "3px 7px" : "4px 9px",
                    borderRadius: 999,
                    fontWeight: 820,
                    cursor: "pointer",
                    fontSize: configCartaProductosChrome ? 9 : 11,
                    lineHeight: configCartaProductosChrome ? 1.06 : 1.15,
                    minHeight: configCartaProductosChrome ? 22 : 26,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div style={{ flexGrow: 1, minHeight: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {items.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "28px 16px",
                  textAlign: "center",
                  color: iceVisual ? "#64748b" : "#94a3b8",
                }}
              >
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: iceVisual ? "#0f172a" : "#e2e8f0" }}>{t("carta.emptyTitle")}</p>
                <p style={{ margin: "12px 0 0", maxWidth: 400, fontSize: 14, lineHeight: 1.5 }}>{t("carta.emptyBody")}</p>
                <button
                  type="button"
                  onClick={openCreate}
                  style={{
                    marginTop: 20,
                    border: "none",
                    background: "#16a34a",
                    color: "#fff",
                    padding: "12px 22px",
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 15,
                    minHeight: 48,
                    boxShadow: iceVisual ? "0 10px 28px -14px rgba(22, 163, 74, 0.55)" : undefined,
                  }}
                >
                  {t("carta.emptyCta")}
                </button>
              </div>
            ) : filteredSorted.length === 0 ? (
              <div style={{ padding: "24px 8px", textAlign: "center", color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 14 }}>{t("stock.filterEmpty")}</div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: "24px 8px", textAlign: "center", color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 14 }}>{t("carta.searchNoResults")}</div>
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  background: iceVisual ? "var(--hostly-surface-operational)" : "rgba(2, 6, 23, 0.18)",
                  border: "none",
                  borderRadius: 0,
                  boxShadow: "none",
                }}
              >
                {selectedIds.size > 0 ? (
                  <div
                    style={{
                      flexShrink: 0,
                      padding: "4px 8px",
                      borderBottom: iceVisual ? "1px solid var(--hostly-table-divider-soft)" : "1px solid #334155",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                      background: iceVisual ? "rgba(224, 242, 254, 0.92)" : "rgba(56, 189, 248, 0.07)",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 850, color: iceVisual ? "#0369a1" : "#bae6fd" }}>
                      {t("productos.bulkSelectedCount", { count: String(selectedIds.size) })}
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {bulkSelectionBreakdown.countFueraCarta > 0 ? (
                        <button
                          type="button"
                          onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsFuera, { activo: true })}
                          style={{
                            ...rowActionBtn,
                            border: "1px solid rgba(74, 222, 128, 0.45)",
                            background: "rgba(34, 197, 94, 0.14)",
                            color: "#dcfce7",
                            fontWeight: 800,
                          }}
                        >
                          {t("productos.bulkVolverCartaCount", { count: String(bulkSelectionBreakdown.countFueraCarta) })}
                        </button>
                      ) : null}
                      {bulkSelectionBreakdown.countEnCarta > 0 ? (
                        <button
                          type="button"
                          onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsEnCarta, { activo: false })}
                          style={{
                            ...rowActionBtn,
                            border: "1px solid rgba(251, 191, 36, 0.5)",
                            background: "rgba(245, 158, 11, 0.12)",
                            color: "#fef3c7",
                            fontWeight: 800,
                          }}
                        >
                          {t("productos.bulkQuitarCartaCount", { count: String(bulkSelectionBreakdown.countEnCarta) })}
                        </button>
                      ) : null}
                      {bulkSelectionBreakdown.countInactivos > 0 ? (
                        <button
                          type="button"
                          onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsInactivos, { isActive: true })}
                          style={{
                            ...rowActionBtn,
                            border: "1px solid rgba(52, 211, 153, 0.4)",
                            background: "rgba(16, 185, 129, 0.1)",
                            color: "#a7f3d0",
                            fontWeight: 700,
                          }}
                        >
                          {t("productos.bulkActivarCount", { count: String(bulkSelectionBreakdown.countInactivos) })}
                        </button>
                      ) : null}
                      {bulkSelectionBreakdown.countActivosVenta > 0 ? (
                        <button
                          type="button"
                          onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsActivosVenta, { isActive: false })}
                          style={{
                            ...rowActionBtn,
                            border: "1px solid rgba(148, 163, 184, 0.45)",
                            background: "rgba(51, 65, 85, 0.35)",
                            color: "#e2e8f0",
                            fontWeight: 700,
                          }}
                        >
                          {t("productos.bulkDesactivarCount", { count: String(bulkSelectionBreakdown.countActivosVenta) })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div style={{ overflowX: "auto", flex: 1, minHeight: 0, width: "100%", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ width: "100%", minWidth: productosTableMinInnerWidthPx, minHeight: 0, boxSizing: "border-box" }}>
                    <div
                      className={iceVisual ? "hostly-config-table-head sticky top-0 z-[2]" : undefined}
                      style={{
                        ...(iceProductosDataGridStyle),
                        padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                        ...(iceVisual
                          ? {
                              background: "var(--hostly-table-head-surface)",
                              borderBottom: "1px solid var(--hostly-table-divider-soft)",
                              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.52)",
                            }
                          : {
                              background: "rgba(2, 6, 23, 0.35)",
                              borderBottom: "1px solid var(--hostly-table-divider-faint)",
                            }),
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          margin: 0,
                          cursor: displayed.length === 0 ? "default" : "pointer",
                          minWidth: 0,
                        }}
                      >
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          disabled={displayed.length === 0}
                          checked={displayed.length > 0 && displayed.every((p) => selectedIds.has(p.id))}
                          onChange={toggleSelectAllDisplayed}
                          aria-label={t("productos.selectAllVisible")}
                          style={{ width: iceVisual ? 14 : 16, height: iceVisual ? 14 : 16, cursor: displayed.length === 0 ? "not-allowed" : "pointer", accentColor: "#38bdf8" }}
                        />
                      </label>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colNombre")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colTipo")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colCategoria")}</span>
                      <div style={productGridPriceCell}>
                        <span style={{ ...colHeadStyleResolved, textAlign: "right", width: "100%" }}>{t("carta.colPrecio")}</span>
                      </div>
                      <span style={{ ...colHeadStyleResolved, textAlign: "center" }}>{t("productos.colCarta")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "center" }}>{t("productos.colEscandallo")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "right" }}>{t("carta.colActions")}</span>
                    </div>
                    <div>
                      {viewMode === "grouped"
                        ? groupedByCategoria.map((g, gi) => (
                            <div key={`cat-${g.sectionKey}-${gi}`}>
                              <div
                                role="presentation"
                                style={{
                                  ...(iceProductosGroupBarGridStyle),
                                  marginTop: gi === 0 ? 0 : 6,
                                  paddingTop: gi === 0 ? 4 : 8,
                                  paddingBottom: 2,
                                  paddingLeft: 8,
                                  paddingRight: 8,
                                  borderTop: gi === 0 ? "none" : iceVisual ? PRODUCTOS_ROW_DIVIDER_ICE : "1px solid var(--hostly-table-divider-faint)",
                                  background: "transparent",
                                }}
                              >
                                <div
                                  style={{
                                    gridColumn: "1 / -1",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    minWidth: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: iceVisual ? 9 : 10,
                                      fontWeight: 600,
                                      letterSpacing: iceVisual ? "0.1em" : "0.12em",
                                      textTransform: "uppercase",
                                      color: iceVisual ? "rgba(71, 85, 105, 0.72)" : "#94a3b8",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      minWidth: 0,
                                    }}
                                  >
                                    {g.categoria}
                                  </div>
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      fontSize: 9,
                                      fontWeight: 600,
                                      letterSpacing: "0.06em",
                                      color: "#64748b",
                                      fontVariantNumeric: "tabular-nums",
                                      padding: "2px 7px",
                                      borderRadius: 999,
                                      border: iceVisual ? "1px solid var(--hostly-table-divider-soft)" : "1px solid var(--hostly-table-divider-faint)",
                                      background: iceVisual ? "rgba(255, 255, 255, 0.4)" : "rgba(248, 250, 252, 0.03)",
                                    }}
                                  >
                                    {g.items.length}
                                  </span>
                                </div>
                              </div>
                              {g.items.map((p, idx) => {
                                const tiene = tieneEscandalloForPlato(p, meta);
                                const busyEsc = escNavId === p.id;
                                const isLastInCat = idx === g.items.length - 1;
                                return (
                                  <div
                                    key={p.id}
                                    className={PRODUCTOS_ROW_HOVER_CLASS}
                                    style={{
                                      ...(iceProductosDataGridStyle),
                                      padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                                      borderBottom:
                                        isLastInCat && gi === groupedByCategoria.length - 1
                                          ? "none"
                                          : iceVisual
                                            ? PRODUCTOS_ROW_DIVIDER_ICE
                                            : "1px solid rgba(148, 163, 184, 0.06)",
                                      background: "transparent",
                                      minHeight: iceVisual ? productRowMinHeightIce : productRowMinHeight,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        margin: 0,
                                        cursor: "pointer",
                                        justifySelf: "center",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.has(p.id)}
                                        onChange={() => toggleRowSelected(p.id)}
                                        aria-label={t("productos.selectRowAria", { name: p.nombre })}
                                        style={{
                                          width: iceVisual ? 14 : 16,
                                          height: iceVisual ? 14 : 16,
                                          accentColor: "#38bdf8",
                                          cursor: "pointer",
                                        }}
                                      />
                                    </label>
                                    <div style={{ minWidth: 0, overflow: "hidden", width: "100%" }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: iceVisual ? 8 : 6,
                                          alignItems: "center",
                                          minWidth: 0,
                                          overflow: "hidden",
                                          width: "100%",
                                          paddingTop: iceVisual ? 1 : 0,
                                        }}
                                        title={p.nombre}
                                      >
                                        <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                        {p.origenAlta === "importacion_ia" ? (
                                          <span
                                            style={{
                                              flexShrink: 0,
                                              fontSize: iceVisual ? 7 : 9,
                                              fontWeight: iceVisual ? 600 : 900,
                                              letterSpacing: "0.08em",
                                              textTransform: "uppercase",
                                              padding: iceVisual ? "0px 4px" : "2px 6px",
                                              borderRadius: iceVisual ? 4 : 999,
                                              border: iceVisual
                                                ? "1px solid rgba(148, 163, 184, 0.2)"
                                                : "1px solid rgba(56,189,248,0.28)",
                                              background: iceVisual ? "transparent" : "rgba(8,47,73,0.18)",
                                              color: iceVisual ? "#94a3b8" : "#7dd3fc",
                                            }}
                                          >
                                            IA
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <span style={rowTipoStyleResolved} title={labelTipoVenta(t, p.tipoVenta)}>
                                      {labelTipoVenta(t, p.tipoVenta)}
                                    </span>
                                    <span style={rowCategoriaStyleResolved} title={p.categoria}>
                                      {p.categoria}
                                    </span>
                                    <div style={productGridPriceCell}>
                                      <span style={rowPrecioStyleResolved}>{formatEuro(p.precioVenta, locale as Locale)}</span>
                                    </div>
                                    <ProductRowPublicationCell p={p} t={t} embedLight={iceVisual} />
                                    <ProductRowEscandalloCell tiene={tiene} t={t} embedLight={iceVisual} />
                                    <ProductRowActions
                                      p={p}
                                      busyEsc={busyEsc}
                                      t={t}
                                      embedLight={iceVisual}
                                      inventoryIconToolbar={configCartaProductosChrome}
                                      onEdit={() => openEdit(p)}
                                      onToggleCarta={() => toggleActivo(p)}
                                      onActivateProduct={() => activateProducto(p)}
                                      onEsc={() => void goToEscandallo(p)}
                                      onDelete={() => deleteProducto(p)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ))
                        : displayed.map((p, idx) => {
                            const tiene = tieneEscandalloForPlato(p, meta);
                            const busyEsc = escNavId === p.id;
                            const isLast = idx === displayed.length - 1;
                            return (
                              <div
                                key={p.id}
                                className={PRODUCTOS_ROW_HOVER_CLASS}
                                style={{
                                  ...(iceProductosDataGridStyle),
                                  padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                                  borderBottom: isLast ? "none" : iceVisual ? PRODUCTOS_ROW_DIVIDER_ICE : "1px solid var(--hostly-table-divider-faint)",
                                  background: "transparent",
                                  minHeight: iceVisual ? productRowMinHeightIce : productRowMinHeight,
                                }}
                              >
                                <label
                                  style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    margin: 0,
                                    cursor: "pointer",
                                    justifySelf: "center",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => toggleRowSelected(p.id)}
                                    aria-label={t("productos.selectRowAria", { name: p.nombre })}
                                    style={{
                                      width: iceVisual ? 14 : 16,
                                      height: iceVisual ? 14 : 16,
                                      accentColor: "#38bdf8",
                                      cursor: "pointer",
                                    }}
                                  />
                                </label>
                                <div style={{ minWidth: 0, overflow: "hidden", width: "100%" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: iceVisual ? 8 : 6,
                                      alignItems: "center",
                                      minWidth: 0,
                                      overflow: "hidden",
                                      width: "100%",
                                      paddingTop: iceVisual ? 1 : 0,
                                    }}
                                    title={p.nombre}
                                  >
                                    <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                    {p.origenAlta === "importacion_ia" ? (
                                      <span
                                        style={{
                                          flexShrink: 0,
                                          fontSize: iceVisual ? 7 : 9,
                                          fontWeight: iceVisual ? 600 : 900,
                                          letterSpacing: "0.08em",
                                          textTransform: "uppercase",
                                          padding: iceVisual ? "0px 4px" : "2px 6px",
                                          borderRadius: iceVisual ? 4 : 999,
                                          border: iceVisual
                                            ? "1px solid rgba(148, 163, 184, 0.2)"
                                            : "1px solid rgba(56,189,248,0.28)",
                                          background: iceVisual ? "transparent" : "rgba(8,47,73,0.18)",
                                          color: iceVisual ? "#94a3b8" : "#7dd3fc",
                                        }}
                                      >
                                        IA
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <span style={rowTipoStyleResolved} title={labelTipoVenta(t, p.tipoVenta)}>
                                  {labelTipoVenta(t, p.tipoVenta)}
                                </span>
                                <span style={rowCategoriaStyleResolved} title={p.categoria}>
                                  {p.categoria}
                                </span>
                                <div style={productGridPriceCell}>
                                  <span style={rowPrecioStyleResolved}>{formatEuro(p.precioVenta, locale as Locale)}</span>
                                </div>
                                <ProductRowPublicationCell p={p} t={t} embedLight={iceVisual} />
                                <ProductRowEscandalloCell tiene={tiene} t={t} embedLight={iceVisual} />
                                <ProductRowActions
                                  p={p}
                                  busyEsc={busyEsc}
                                  t={t}
                                  embedLight={iceVisual}
                                  inventoryIconToolbar={configCartaProductosChrome}
                                  onEdit={() => openEdit(p)}
                                  onToggleCarta={() => toggleActivo(p)}
                                  onActivateProduct={() => activateProducto(p)}
                                  onEsc={() => void goToEscandallo(p)}
                                  onDelete={() => deleteProducto(p)}
                                />
                              </div>
                            );
                          })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ProductosTableChrome>
      </HostlySection>
      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? t("carta.editProduct") : t("carta.newProduct")}
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end", background: "rgba(2, 6, 23, 0.62)", backdropFilter: "blur(6px)" }}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeForm();
          }}
        >
          <aside
            style={{
              height: "100%",
              width: "min(520px, 92vw)",
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(2, 6, 23, 0.98) 100%)",
              borderLeft: "1px solid rgba(148, 163, 184, 0.16)",
              boxShadow: "-16px 0 48px rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(148, 163, 184, 0.14)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>{editingId ? t("carta.editProduct") : t("carta.newProduct")}</div>
                  {editingId && editingPlato ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                      {t("carta.colEscandallo")}:{" "}
                      <span style={{ color: editingHasEscandallo ? "#86efac" : "#fbbf24", fontWeight: 800 }}>
                        {editingHasEscandallo ? t("carta.escSi") : t("carta.escNo")}
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>{t("carta.kpiSinEscSub")}</div>
                  )}
                </div>
                <button type="button" onClick={closeForm} style={{ border: "1px solid #334155", background: "rgba(15, 23, 42, 0.55)", color: "#e2e8f0", borderRadius: 10, padding: "10px 12px", fontWeight: 800, cursor: "pointer", minHeight: 44 }}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", WebkitOverflowScrolling: "touch", padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t("carta.fieldNombre")}</label>
                  <input ref={nombreInputRef} value={draftNombre} onChange={(e) => setDraftNombre(e.target.value)} style={{ ...inputStyle, fontSize: 17, padding: "14px 14px" }} />
                </div>

                <div>
                  <label style={labelStyle}>{t("carta.fieldTipo")}</label>
                  <select
                    value={draftTipo}
                    onChange={(e) => {
                      const next = e.target.value as TipoProductoVenta;
                      setDraftTipo(next);
                      setDraftCartaMenuFamiliaId(null);
                      setDraftCategoriaCartaId((id) => {
                        if (!id) return null;
                        const c = cartaCategorias.find((x) => x.id === id);
                        return c && isCartaCategoriaCompatibleWithTipoProducto(c, next) ? id : null;
                      });
                    }}
                    style={{ ...inputStyle, fontSize: 16, padding: "14px 14px", minHeight: 52, cursor: "pointer" }}
                  >
                    {TIPOS_PRODUCTO_VENTA.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {labelTipoVenta(t, tipo)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Área de preparación</label>
                  <select
                    value={draftPreparationArea}
                    onChange={(e) => setDraftPreparationArea(e.target.value)}
                    style={{
                      ...inputStyle,
                      fontSize: 16,
                      padding: "14px 14px",
                      minHeight: 52,
                      cursor: "pointer",
                    }}
                  >
                    <option value="cocina">cocina</option>
                    <option value="barra">barra</option>
                    <option value="cocteleria">cocteleria</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{t("carta.fieldCartaFamilia")}</label>
                  <select
                    value={draftCartaMenuFamiliaId === null ? "" : draftCartaMenuFamiliaId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const nextFilter = v === "" ? null : v;
                      setDraftCartaMenuFamiliaId(nextFilter);
                      setDraftCategoriaCartaId((cur) => {
                        if (!cur) return null;
                        const allowed = cartaCategoriasForTipoYFamiliaFiltro(cartaCategorias, draftTipo, nextFilter);
                        return allowed.some((x) => x.id === cur) ? cur : null;
                      });
                    }}
                    style={{ ...inputStyle, fontSize: 16, padding: "14px 14px", minHeight: 52, cursor: "pointer" }}
                  >
                    <option value="">{t("carta.familiaFilterAll")}</option>
                    <option value={CARTA_MENU_FAMILIA_FILTER_UNASSIGNED}>{t("carta.familiaFilterUnassigned")}</option>
                    {[...cartaFamilias]
                      .filter((f) => f.isActive !== false)
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>{t("carta.fieldCartaFamiliaHint")}</p>
                </div>

                <CategoriaCartaFormField
                  labelStyle={labelStyle}
                  inputStyle={{ ...inputStyle, fontSize: 16, padding: "14px 14px" }}
                  t={t}
                  categorias={categoriasForForm}
                  selectedId={draftCategoriaCartaId}
                  onSelectId={(id) => {
                    setDraftCategoriaCartaId(id);
                    if (!id) return;
                    const c = cartaCategorias.find((x) => x.id === id);
                    if (!c) return;
                    setDraftCartaMenuFamiliaId(
                      c.cartaFamiliaId?.trim() ? c.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
                    );
                  }}
                  onOpenAddCategory={() => {
                    setAddCatType(defaultCartaCategoriaTipoForTipoProducto(draftTipo));
                    const fid = draftCartaMenuFamiliaId;
                    setAddCatCartaFamiliaId(
                      fid && fid !== CARTA_MENU_FAMILIA_FILTER_UNASSIGNED ? fid : undefined,
                    );
                    setAddCategoryOpen(true);
                  }}
                />

                <div>
                  <label style={labelStyle}>{t("carta.fieldPrecio")}</label>
                  <input type="number" inputMode="decimal" step="any" min={0} value={draftPrecio} onChange={(e) => setDraftPrecio(e.target.value)} style={{ ...inputStyle, ...tabularFigures, fontSize: 17, padding: "14px 14px" }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#e2e8f0", userSelect: "none" }}>
                    <input type="checkbox" checked={draftActivo} onChange={(e) => setDraftActivo(e.target.checked)} style={{ width: 24, height: 24, accentColor: "#22c55e" }} />
                    {t("carta.fieldActivo")}
                  </label>
                </div>

                <div>
                  <label style={labelStyle}>{t("carta.fieldDescripcion")}</label>
                  <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 90, padding: "14px 14px", fontSize: 15 }} />
                </div>

                <div>
                  <label style={labelStyle}>{t("carta.fieldFoto")}</label>
                  <input value={draftFoto} onChange={(e) => setDraftFoto(e.target.value)} style={{ ...inputStyle, padding: "14px 14px" }} />
                </div>

                {formError ? (
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(248, 113, 113, 0.12)", border: "1px solid rgba(248, 113, 113, 0.35)", color: "#fecaca", fontSize: 13, lineHeight: 1.35 }}>
                    {formError}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: "12px 16px", borderTop: "1px solid rgba(148, 163, 184, 0.14)", background: "rgba(2, 6, 23, 0.9)", display: "flex", gap: 10 }}>
              <button type="button" onClick={() => void submitForm()} disabled={drawerSyncing} style={{ flex: 1, border: "none", background: drawerSyncing ? "rgba(59, 130, 246, 0.5)" : "#3b82f6", color: "#fff", padding: "14px 18px", borderRadius: 12, fontWeight: 800, cursor: drawerSyncing ? "not-allowed" : "pointer", fontSize: 16, minHeight: 54 }}>
                {drawerSyncing ? t("common.preparing") : t("common.save")}
              </button>
              <button type="button" onClick={closeForm} style={{ border: "1px solid #475569", background: "transparent", color: "#e2e8f0", padding: "14px 18px", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 16, minHeight: 54 }}>
                {t("common.cancel")}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {addCategoryOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("cartaCategories.quickAddTitle")}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 55,
            background: "rgba(2, 6, 23, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddCategoryOpen(false);
          }}
        >
          <div
            style={{
              width: "min(400px, 100%)",
              borderRadius: 14,
              border: "1px solid #334155",
              background: "#0f172a",
              padding: 20,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f8fafc" }}>{t("cartaCategories.quickAddTitle")}</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t("cartaCategories.name")}</label>
                <input value={addCatName} onChange={(e) => setAddCatName(e.target.value)} style={{ ...inputStyle, fontSize: 16, padding: "12px 14px" }} />
              </div>
              <div>
                <label style={labelStyle}>{t("cartaCategories.typeField")}</label>
                <select
                  value={addCatType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddCatType(isCartaCategoriaTipo(v) ? v : "general");
                  }}
                  style={{ ...inputStyle, fontSize: 16, padding: "12px 14px", minHeight: 48, cursor: "pointer" }}
                >
                  <option value="food">{t("cartaCategories.type.food")}</option>
                  <option value="drink">{t("cartaCategories.type.drink")}</option>
                  <option value="general">{t("cartaCategories.type.general")}</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                disabled={addCatSaving}
                onClick={() => void saveQuickCategory()}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: "none",
                  background: addCatSaving ? "#475569" : "#22c55e",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: addCatSaving ? "not-allowed" : "pointer",
                }}
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setAddCategoryOpen(false)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModulePageShell>
    </>
  );
}

