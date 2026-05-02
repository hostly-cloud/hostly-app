import type { CSSProperties } from "react";

/** Título del bloque operativo principal (por encima del listado / mesa de trabajo). */
export const OPER_PRIMARY_SECTION_TITLE: CSSProperties = {
  margin: 0,
  fontSize: "clamp(16px, 1.75vw, 21px)",
  fontWeight: 800,
  letterSpacing: "-0.03em",
  lineHeight: 1.12,
  color: "#f8fafc",
};

export const OPER_PRIMARY_COUNT_META: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 11,
  fontWeight: 600,
  color: "#94a3b8",
  lineHeight: 1.32,
};
