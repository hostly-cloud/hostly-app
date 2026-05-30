import type { SVGProps } from "react";
import { HostlyRowActionButton, HostlyRowActions, HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import type { PlatoCarta } from "@/lib/platos-local";
import type { TranslateFn } from "@/lib/i18n";

export const PRODUCTOS_CARTA_LEGACY_BLOCKED = "Migra el catálogo para editar productos.";

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
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onPrimaryCarta}
        title={cartaTitle}
        aria-label={cartaTitle}
      >
        <IconCartaPrimary status={status} />
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="icon"
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onEdit}
        title={editTitle}
        aria-label={editTitle}
      >
        <IconPencil />
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="icon"
        disabled={!escEnabled}
        onClick={onEsc}
        title={escTitle}
        aria-label={escLabel}
      >
        <IconChart />
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="icon"
        tone="danger"
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
