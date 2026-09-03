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

const controlClassName = (tone: "dark" | "light", moduleChrome?: boolean) =>
  hostlyCx(
    "hostly-touch-nav-link hostly-nav-aux hostly-back-button",
    tone === "dark" && "hostly-back-button--dark",
    tone === "light" && "hostly-back-button--light",
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
        className={controlClassName(tone, moduleChrome)}
        aria-label={props.ariaLabel ?? "Volver"}
        title="Volver"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={controlClassName(tone, moduleChrome)}
      aria-label={props.ariaLabel ?? "Volver"}
      title="Volver"
    >
      {content}
    </button>
  );
}
