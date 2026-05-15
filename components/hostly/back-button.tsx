"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export type HostlyBackButtonProps = {
  label: ReactNode;
  ariaLabel?: string;
  /** `light`: cabecera clara (Configuración). Por defecto `dark` (dashboard oscuro). */
  tone?: "dark" | "light";
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
);

function normalizeLabel(label: ReactNode): ReactNode {
  if (typeof label !== "string") return label;
  // Prevent double arrows when translations include "← ...".
  return label.replace(/^\s*←\s*/u, "");
}

const sharedDark: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(2, 6, 23, 0.18)",
  color: "#f8fafc",
  cursor: "pointer",
  letterSpacing: "-0.02em",
  lineHeight: 1.15,
  borderRadius: 10,
  textDecoration: "none",
};

const sharedLight: CSSProperties = {
  ...sharedDark,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(255, 255, 255, 0.72)",
  color: "#0f172a",
};

const arrowDark: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: 6,
  border: "1px solid rgba(148, 163, 184, 0.12)",
  background: "rgba(2, 6, 23, 0.12)",
  color: "#e2e8f0",
  fontWeight: 900,
  lineHeight: 1,
  flexShrink: 0,
};

const arrowLight: CSSProperties = {
  ...arrowDark,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(248, 250, 252, 0.95)",
  color: "#0f172a",
};

const labelDark: CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  color: "#cbd5e1",
  minWidth: 0,
};

const labelLight: CSSProperties = {
  ...labelDark,
  color: "#334155",
};

export function HostlyBackButton(props: HostlyBackButtonProps) {
  const tone = props.tone ?? "dark";
  const sharedStyle = tone === "light" ? sharedLight : sharedDark;
  const arrowStyle = tone === "light" ? arrowLight : arrowDark;
  const labelStyle = tone === "light" ? labelLight : labelDark;
  const label = normalizeLabel(props.label);
  const content = (
    <>
      <span aria-hidden="true" style={arrowStyle}>
        ←
      </span>
      <span style={labelStyle}>{label}</span>
    </>
  );

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        className="hostly-touch-nav-link hostly-nav-aux"
        aria-label={props.ariaLabel ?? "Volver"}
        title="Volver"
        style={sharedStyle}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="hostly-touch-nav-link hostly-nav-aux"
      aria-label={props.ariaLabel ?? "Volver"}
      title="Volver"
      style={sharedStyle}
    >
      {content}
    </button>
  );
}

