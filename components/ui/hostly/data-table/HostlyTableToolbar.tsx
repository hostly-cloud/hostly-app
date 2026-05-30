import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

export type HostlyTableToolbarProps = {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
};

/** Barra superior de listado/tablas operacionales (bulk, filtros inline, meta). */
export function HostlyTableToolbar({ children, className, sticky }: HostlyTableToolbarProps) {
  return (
    <div className={hostlyCx("hostly-data-table-toolbar", sticky && "is-sticky", className)}>
      {children}
    </div>
  );
}

export function HostlyTableBulkBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={hostlyCx("hostly-data-table-bulk-bar", className)}>{children}</div>;
}
