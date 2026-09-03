import type { CSSProperties, SVGProps } from "react";
import Image from "next/image";
import { HostlyRowActionButton, HostlyRowActions, HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { getProductFamilyLabel } from "@/lib/carta/product-category-family-resolver";
import {
  getProductCatalogCourseLabel,
  isMenuCourse,
  type ProductCatalogCourse,
} from "@/lib/carta/menu-course";
import { resolveKdsDestination, type KdsDestination } from "@/lib/kds/kds-destination";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import { presentProductOperationalRoutingAudit, presentProductResolverParityAudit, getProductResolverParityRecommendation } from "@/lib/productos/product-operational-routing-audit-labels";
import {
  auditProductOperationalRouting,
  auditProductResolverParity,
  buildProductResolverParityContextForPlato,
  type ProductResolverParityAudit,
  type ProductResolverParityCatalogSources,
  type ProductResolverParityIssue,
} from "@/lib/productos/product-operational-routing-audit";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import type { TranslateFn } from "@/lib/i18n";

export type ProductEditFocus = "routing" | "recipe";

export type ProductEditOptions = {
  focus?: ProductEditFocus;
};

export type OpenProductEditFn = (p: PlatoCarta, options?: ProductEditOptions) => void;

export const PRODUCTOS_CARTA_LEGACY_BLOCKED = "Migra el catálogo para editar productos.";

const CORRECTABLE_ROUTING_PARITY_ISSUES = new Set<ProductResolverParityIssue>([
  "DIVERGENCIA_BUCKET",
  "DIVERGENCIA_STATION",
  "DIVERGENCIA_PREPARATION_AREA",
  "FALTA_STATION",
  "FALLBACK_HEURISTICO",
  "SIN_OPERATION_STATION",
]);

export function productHasCorrectableRoutingParityIssue(
  parity: ProductResolverParityAudit,
): boolean {
  return parity.issues.some(
    (issue) => issue !== "OK" && CORRECTABLE_ROUTING_PARITY_ISSUES.has(issue),
  );
}

function computeProductResolverParityAudit(
  p: PlatoCarta,
  sources: ProductResolverParityCatalogSources,
): ProductResolverParityAudit {
  return auditProductResolverParity(
    p,
    buildProductResolverParityContextForPlato(p, sources),
  );
}

/** URL de imagen operativa del producto (catálogo central → `fotoUrl`). */
export function productImageUrlFromPlato(p: PlatoCarta): string | undefined {
  const url = p.fotoUrl?.trim();
  return url || undefined;
}

/** Inicial del nombre para avatar de fallback (misma semántica que TPV). */
export function productNameInitialFromPlato(p: PlatoCarta): string {
  return (p.nombre.trim().charAt(0) || "?").toUpperCase();
}

/** Fondo pastel estable según el nombre (misma entrada → mismo color). */
function softBackgroundFromName(name: string): string {
  const s = name.trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 44%, 90%)`;
}

/** Miniatura 40×40 en columna Nombre: imagen real o avatar con inicial. */
export function ProductosCartaNameThumb({
  p,
  className,
  style,
}: {
  p: PlatoCarta;
  className?: string;
  style?: CSSProperties;
}) {
  const imageUrl = productImageUrlFromPlato(p);
  const initial = productNameInitialFromPlato(p);
  const classes = ["hostly-productos-carta-name-thumb", className].filter(Boolean).join(" ");

  if (imageUrl) {
    return (
      <span
        className={classes}
        style={{
          ...style,
          position: "relative",
          backgroundColor: softBackgroundFromName(p.nombre),
        }}
        aria-hidden
      >
        <span className="hostly-productos-carta-name-thumb__initial">{initial}</span>
        <Image
          src={imageUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="hostly-productos-carta-name-thumb__img"
          loading="lazy"
          decoding="async"
          style={{ position: "absolute", inset: 0 }}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </span>
    );
  }

  return (
    <span
      className={classes}
      style={{ ...style, backgroundColor: softBackgroundFromName(p.nombre) }}
      aria-hidden
    >
      <span className="hostly-productos-carta-name-thumb__initial">{initial}</span>
    </span>
  );
}

const KDS_DESTINATION_SHORT: Record<KdsDestination, string> = {
  kitchen: "Coc",
  bar: "Bar",
  cocktail: "Coct",
  none: "—",
};

const KDS_DESTINATION_FULL: Record<KdsDestination, string> = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
  none: "Sin destino",
};

function readCatalogCourseFromPlato(p: PlatoCarta): ProductCatalogCourse | undefined {
  const raw = (p as PlatoCarta & { course?: unknown }).course;
  if (raw === undefined) return undefined;
  if (raw == null || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  return isMenuCourse(n) ? n : null;
}

/** Etiqueta corta de pase para celda densa (misma semántica que chip TPV). */
export function productCatalogCourseChipShort(
  course: ProductCatalogCourse | undefined,
): string {
  if (course == null || course === undefined) return "S/P";
  if (course === 1) return "ENT";
  if (course === 2) return "1º";
  if (course === 3) return "2º";
  if (course === 4) return "POS";
  return "S/P";
}

/** Presentación celda SECCIÓN: oculta etiqueta redundante si coincide con la categoría activa. */
export function formatProductosCartaSectionCellDisplay(
  categoria: string | undefined | null,
  activeCategoryLabel: string | undefined,
  uncategorizedLabel: string,
): { display: string; title: string; isRedundant: boolean } {
  const sectionLabel = categoria?.trim() ? categoria.trim() : uncategorizedLabel;
  const active = activeCategoryLabel?.trim() ?? "";
  if (active && categoria?.trim() && categoria.trim() === active) {
    return { display: "—", title: sectionLabel, isRedundant: true };
  }
  return { display: sectionLabel, title: sectionLabel, isRedundant: false };
}

export function productOperationalFieldsFromPlato(p: PlatoCarta): {
  familyShort: string;
  familyFull: string;
  courseShort: string;
  courseFull: string;
  destinationShort: string;
  destinationFull: string;
  tabletMeta: string;
} {
  const familyFull = getProductFamilyLabel({
    productFamilyId: p.productFamilyId ?? null,
    productFamilyName: p.productFamilyName ?? null,
    productFamilyType: p.productFamilyType ?? null,
  });
  const familyShort =
    familyFull.length > 10 ? `${familyFull.slice(0, 9).trim()}…` : familyFull;

  const course = readCatalogCourseFromPlato(p);
  const courseFull = getProductCatalogCourseLabel(course);
  const courseShort = productCatalogCourseChipShort(
    course === undefined ? undefined : course,
  );

  const dest = resolveKdsDestination({
    station: p.preparationArea,
    preparationArea: p.preparationArea,
    operationStationId: p.operationStationId,
    operationStationName: p.operationStationName,
    categoria: p.categoria,
    categoryName: p.categoria,
    nombre: p.nombre,
    name: p.nombre,
  });
  const destinationShort = KDS_DESTINATION_SHORT[dest];
  const destinationFull = KDS_DESTINATION_FULL[dest];

  const tabletMeta = [p.categoria, familyShort, courseShort, destinationShort]
    .filter((part) => part && part !== "—")
    .join(" · ");

  return {
    familyShort,
    familyFull,
    courseShort,
    courseFull,
    destinationShort,
    destinationFull,
    tabletMeta,
  };
}

export function ProductosCartaOperMicrochip({
  label,
  title,
  className,
}: {
  label: string;
  title: string;
  className?: string;
}) {
  return (
    <HostlyStatusBadge
      tone="neutral"
      dot={false}
      title={title}
      aria-label={title}
      className={[
        "hostly-data-table-microchip hostly-data-table-microchip--oper hostly-productos-carta-table-chip",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </HostlyStatusBadge>
  );
}

export function ProductosCartaRoutingAuditChip({
  p,
  t,
  operationStations,
  productionStations,
  cartaCategorias,
  cartaFamilias,
  className,
  showRecommendationHint,
  parityAudit,
}: {
  p: PlatoCarta;
  t: TranslateFn;
  operationStations?: readonly OperationStationDocument[];
  productionStations?: readonly ProductionStationDocument[];
  cartaCategorias?: readonly CartaCategoria[];
  cartaFamilias?: readonly CartaFamilia[];
  className?: string;
  /** Muestra título de acción recomendada junto al chip (tablet/mobile). */
  showRecommendationHint?: boolean;
  /** Evita recalcular paridad si ya se obtuvo en la celda padre. */
  parityAudit?: ProductResolverParityAudit;
}) {
  const paritySources: ProductResolverParityCatalogSources = {
    operationStations,
    productionStations,
    cartaCategorias,
    cartaFamilias,
  };
  const audit = auditProductOperationalRouting(p, operationStations);
  const parity = parityAudit ?? computeProductResolverParityAudit(p, paritySources);
  const { shortLabel, title, tone } = presentProductOperationalRoutingAudit(audit, t);
  const fullTitle = presentProductResolverParityAudit(parity, t, title);
  const recommendation = getProductResolverParityRecommendation(parity, t);
  const hostlyTone =
    tone === "ok" ? "success" : tone === "danger" ? "danger" : ("warning" as const);
  const hintToneColor =
    recommendation.severity === "danger"
      ? "#b91c1c"
      : recommendation.severity === "warning"
        ? "#b45309"
        : recommendation.severity === "info"
          ? "#0369a1"
          : "#64748b";
  return (
    <span
      className="hostly-productos-routing-audit-chip-wrap"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <HostlyStatusBadge
        tone={hostlyTone}
        dot={false}
        title={fullTitle}
        aria-label={fullTitle}
        className={[
          "hostly-data-table-microchip",
          "hostly-data-table-microchip--routing-audit",
          "hostly-productos-carta-table-chip",
          tone === "ok" ? "hostly-data-table-microchip--routing-audit-ok" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {shortLabel}
      </HostlyStatusBadge>
      {showRecommendationHint && recommendation.severity !== "ok" ? (
        <span
          className="hostly-productos-routing-recommendation-hint"
          title={recommendation.description}
          style={{
            color: hintToneColor,
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1.2,
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {recommendation.title}
        </span>
      ) : null}
    </span>
  );
}

/** Chip routing + acceso compacto a edición cuando hay issue corregible. */
export function ProductosCartaRoutingAuditCell({
  p,
  t,
  operationStations,
  productionStations,
  cartaCategorias,
  cartaFamilias,
  className,
  showRecommendationHint,
  onCorrect,
  correctDisabled,
  correctDisabledTitle,
}: {
  p: PlatoCarta;
  t: TranslateFn;
  operationStations?: readonly OperationStationDocument[];
  productionStations?: readonly ProductionStationDocument[];
  cartaCategorias?: readonly CartaCategoria[];
  cartaFamilias?: readonly CartaFamilia[];
  className?: string;
  showRecommendationHint?: boolean;
  onCorrect?: OpenProductEditFn;
  correctDisabled?: boolean;
  correctDisabledTitle?: string;
}) {
  const paritySources: ProductResolverParityCatalogSources = {
    operationStations,
    productionStations,
    cartaCategorias,
    cartaFamilias,
  };
  const parity = computeProductResolverParityAudit(p, paritySources);
  const showCorrect =
    Boolean(onCorrect) &&
    productHasCorrectableRoutingParityIssue(parity) &&
    !correctDisabled;

  return (
    <span
      className="hostly-productos-routing-audit-cell"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <ProductosCartaRoutingAuditChip
        p={p}
        t={t}
        operationStations={operationStations}
        productionStations={productionStations}
        cartaCategorias={cartaCategorias}
        cartaFamilias={cartaFamilias}
        className={className}
        showRecommendationHint={showRecommendationHint}
        parityAudit={parity}
      />
      {showCorrect ? (
        <button
          type="button"
          className="hostly-productos-routing-correct-btn"
          title={t("productos.routingCorrectTitle")}
          aria-label={t("productos.routingCorrectAria", { name: p.nombre })}
          onClick={(event) => {
            event.stopPropagation();
            onCorrect?.(p, { focus: "routing" });
          }}
        >
          {t("productos.routingCorrectLabel")}
        </button>
      ) : correctDisabled && productHasCorrectableRoutingParityIssue(parity) ? (
        <span
          className="hostly-productos-routing-correct-btn hostly-productos-routing-correct-btn--disabled"
          title={correctDisabledTitle ?? PRODUCTOS_CARTA_LEGACY_BLOCKED}
          aria-hidden
        >
          {t("productos.routingCorrectLabel")}
        </span>
      ) : null}
    </span>
  );
}

type ProductoEstadoVenta = PlatoCarta & { enCarta?: boolean; isActive?: boolean };

export function getPublicationFlags(p: PlatoCarta): {
  isActive: boolean;
  enCarta: boolean;
  status: "onMenu" | "offMenu" | "inactive";
} {
  const raw = p as ProductoEstadoVenta;
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  const enCarta = typeof raw.enCarta === "boolean" ? raw.enCarta : raw.activo;
  if (!isActive) return { isActive, enCarta, status: "inactive" };
  if (enCarta) return { isActive, enCarta, status: "onMenu" };
  return { isActive, enCarta, status: "offMenu" };
}

function publicationTone(status: "onMenu" | "offMenu" | "inactive") {
  if (status === "onMenu") return "success" as const;
  if (status === "offMenu") return "warning" as const;
  return "danger" as const;
}

export function ProductosCartaPublicationBadge({
  p,
  t,
}: {
  p: PlatoCarta;
  t: TranslateFn;
}) {
  const { status } = getPublicationFlags(p);
  const label =
    status === "onMenu"
      ? t("productos.statusBadgeOnMenu")
      : status === "offMenu"
        ? t("productos.statusBadgeOffMenu")
        : t("productos.statusBadgeInactive");
  return (
    <HostlyStatusBadge tone={publicationTone(status)} title={label} aria-label={label}>
      {label}
    </HostlyStatusBadge>
  );
}

export function ProductosCartaEscandalloBadge({
  tiene,
  t,
}: {
  tiene: boolean;
  t: TranslateFn;
}) {
  const label = tiene ? t("productos.escCon") : t("productos.escSin");
  return (
    <HostlyStatusBadge tone={tiene ? "success" : "muted"} title={label} aria-label={label}>
      {label}
    </HostlyStatusBadge>
  );
}

function RowGlyph(props: SVGProps<SVGSVGElement>) {
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

function IconCartaPrimary({ status }: { status: "onMenu" | "offMenu" | "inactive" }) {
  if (status === "inactive") {
    return (
      <RowGlyph>
        <path d="M13 2L4 14h6l-1.5 8L20 9h-6.5L13 2z" />
      </RowGlyph>
    );
  }
  if (status === "onMenu") {
    return (
      <RowGlyph strokeWidth={1.55}>
        <circle cx="12" cy="12" r="8.75" />
        <path d="M8 12h8" />
      </RowGlyph>
    );
  }
  return (
    <RowGlyph>
      <path d="M12 5v14M5 12h14" />
    </RowGlyph>
  );
}

function IconPencil() {
  return (
    <RowGlyph>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </RowGlyph>
  );
}

function IconChart() {
  return (
    <RowGlyph>
      <path d="M4 19V10M12 19V6M16 19v-5M20 19v-2" />
    </RowGlyph>
  );
}

function IconTrash() {
  return (
    <RowGlyph>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
      <path d="M10 11v6M14 11v6" />
    </RowGlyph>
  );
}

export function ProductosCartaReorderControls({
  canMoveUp,
  canMoveDown,
  busy,
  t,
  onMoveUp,
  onMoveDown,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy?: boolean;
  t: TranslateFn;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="hostly-productos-reorder-controls" role="group" aria-label={t("productos.orderModeRowAria")}>
      <button
        type="button"
        className="hostly-productos-reorder-btn"
        disabled={!canMoveUp || busy}
        onClick={onMoveUp}
        aria-label={t("productos.moveUp")}
        title={t("productos.moveUp")}
      >
        ↑
      </button>
      <button
        type="button"
        className="hostly-productos-reorder-btn"
        disabled={!canMoveDown || busy}
        onClick={onMoveDown}
        aria-label={t("productos.moveDown")}
        title={t("productos.moveDown")}
      >
        ↓
      </button>
    </div>
  );
}

export function ProductosCartaRowActions({
  p,
  busyEsc,
  t,
  legacyReadOnly = false,
  onEdit,
  onToggleCarta,
  onActivateProduct,
  onEsc,
  onDelete,
}: {
  p: PlatoCarta;
  busyEsc: boolean;
  t: TranslateFn;
  legacyReadOnly?: boolean;
  onEdit: () => void;
  onToggleCarta: () => void;
  onActivateProduct: () => void;
  onEsc: () => void;
  onDelete: () => void;
}) {
  const { status, enCarta } = getPublicationFlags(p);
  const escEnabled = enCarta && !busyEsc;
  const onPrimaryCarta = status === "inactive" ? onActivateProduct : onToggleCarta;

  const primaryCartaTitle =
    status === "inactive"
      ? t("productos.actionActivateProduct")
      : status === "onMenu"
        ? t("productos.actionQuitarCarta")
        : t("productos.actionVolverCarta");

  const escLabel = busyEsc ? t("carta.escPending") : t("carta.actionEscandallo");
  const escTitle =
    busyEsc ? t("carta.escPending") : !enCarta ? t("productos.escNeedCartaHint") : t("carta.actionEscandallo");

  const editTitle = legacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : t("carta.actionEdit");
  const deleteTitle = legacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : t("common.delete");
  const cartaTitle = legacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : primaryCartaTitle;

  const cartaTone =
    status === "inactive" ? "primary" : status === "onMenu" ? "warning" : ("success" as const);

  return (
    <HostlyRowActions>
      <HostlyRowActionButton
        variant="icon"
        tone={cartaTone}
        className="hostly-product-row-action hostly-product-row-action--publish"
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onPrimaryCarta}
        title={cartaTitle}
        aria-label={cartaTitle}
      >
        <IconCartaPrimary status={status} />
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="text"
        tone="primary"
        className="hostly-product-row-action hostly-product-row-action--edit"
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onEdit}
        title={editTitle}
        aria-label={editTitle}
      >
        <IconPencil />
        <span>{t("carta.actionEdit")}</span>
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="text"
        className="hostly-product-row-action hostly-product-row-action--recipe"
        disabled={!escEnabled}
        onClick={onEsc}
        title={escTitle}
        aria-label={escLabel}
      >
        <IconChart />
        <span>{escLabel}</span>
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="icon"
        tone="danger"
        className="hostly-product-row-action hostly-product-row-action--delete"
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onDelete}
        title={deleteTitle}
        aria-label={deleteTitle}
      >
        <IconTrash />
      </HostlyRowActionButton>
    </HostlyRowActions>
  );
}
