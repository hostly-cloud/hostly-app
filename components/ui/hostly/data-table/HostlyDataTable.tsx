import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

export type HostlyDataTableVariant =
  | "default"
  | "productos-carta"
  | "categorias"
  | "familias"
  | "modificadores"
  | "escandallos"
  | "recipe-ingredients"
  | "compras"
  | "compras-draft"
  | "recepciones"
  | "facturas-proveedor"
  | "invoice-ocr-lines";

export type HostlyDataTableProps = {
  children: ReactNode;
  className?: string;
  variant?: HostlyDataTableVariant;
};

export function HostlyDataTable({ children, className, variant = "default" }: HostlyDataTableProps) {
  return (
    <div
      className={hostlyCx(
        "hostly-data-table-shell",
        variant !== "default" && `hostly-data-table--${variant}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HostlyDataTableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={hostlyCx("hostly-data-table-scroll", className)}>{children}</div>;
}

export function HostlyDataTableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={hostlyCx("hostly-data-table-head hostly-config-table-head", className)} role="row">
      {children}
    </div>
  );
}

export function HostlyDataTableBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={hostlyCx("hostly-data-table-body", className)}>{children}</div>;
}

export type HostlyDataRowProps = {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
  id?: string;
};

export function HostlyDataRow({ children, className, selected, onClick, id }: HostlyDataRowProps) {
  return (
    <div
      id={id}
      role="row"
      className={hostlyCx("hostly-data-table-row", selected && "is-selected", onClick && "is-clickable", className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export type HostlyDataCellAlign = "start" | "center" | "end";

export type HostlyDataCellProps = {
  children: ReactNode;
  className?: string;
  align?: HostlyDataCellAlign;
  col?: string;
};

export function HostlyDataCell({ children, className, align = "start", col }: HostlyDataCellProps) {
  return (
    <div
      role="cell"
      className={hostlyCx(
        "hostly-data-table-cell",
        col && `hostly-data-table-col--${col}`,
        align === "center" && "is-align-center",
        align === "end" && "is-align-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HostlyDataGroupBar({
  children,
  className,
  first,
}: {
  children: ReactNode;
  className?: string;
  first?: boolean;
}) {
  return (
    <div className={hostlyCx("hostly-data-table-group-bar", first && "is-first", className)} role="presentation">
      <div className="hostly-data-table-group-bar__inner">{children}</div>
    </div>
  );
}
