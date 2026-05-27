"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { hostlyCx } from "@/components/ui/hostly";

export type HostlyBackButtonProps = {
  label: ReactNode;
  ariaLabel?: string;
  /** `light`: cabecera clara (dashboard modules). Por defecto `dark`. */
  tone?: "dark" | "light";
  /** Cabecera unificada de módulos dashboard (`ModulePageShell` + `compactLayout`). */
  moduleChrome?: boolean;
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
);

function normalizeLabel(label: ReactNode): ReactNode {
  if (typeof label !== "string") return label;
  return label.replace(/^\s*←\s*/u, "");
}

const sharedDark = {
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
} as const;

const linkClassName = (tone: "dark" | "light", moduleChrome?: boolean) =>
  hostlyCx(
    "hostly-touch-nav-link hostly-nav-aux",
    tone === "light" && moduleChrome && "hostly-back-button--module",
  );

export function HostlyBackButton(props: HostlyBackButtonProps) {
  const tone = props.tone ?? "dark";
  const moduleChrome = Boolean(props.moduleChrome && tone === "light");
  const label = normalizeLabel(props.label);
  const content = (
    <>
      <span aria-hidden="true" className="hostly-back-button__arrow inline-flex shrink-0 items-center justify-center font-black leading-none">
        ←
      </span>
      <span className="hostly-back-button__label min-w-0">{label}</span>
    </>
  );

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        className={linkClassName(tone, moduleChrome)}
        aria-label={props.ariaLabel ?? "Volver"}
        title="Volver"
        style={moduleChrome ? undefined : tone === "light" ? { ...sharedDark, border: "1px solid rgba(148, 163, 184, 0.35)", background: "rgba(255, 255, 255, 0.72)", color: "#0f172a" } : sharedDark}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={linkClassName(tone, moduleChrome)}
      aria-label={props.ariaLabel ?? "Volver"}
      title="Volver"
      style={moduleChrome ? undefined : tone === "light" ? { ...sharedDark, border: "1px solid rgba(148, 163, 184, 0.35)", background: "rgba(255, 255, 255, 0.72)", color: "#0f172a" } : sharedDark}
    >
      {content}
    </button>
  );
}
