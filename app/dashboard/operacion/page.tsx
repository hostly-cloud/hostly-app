"use client";

import type { CSSProperties } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";

type OperacionModuleSlug = "tpv" | "cocina" | "barra" | "sala" | "reservas";

const MODULES: { slug: OperacionModuleSlug; label: string }[] = [
  { slug: "tpv", label: "TPV" },
  { slug: "cocina", label: "Cocina" },
  { slug: "barra", label: "Barra" },
  { slug: "sala", label: "Sala" },
  { slug: "reservas", label: "Reservas" },
];

const KNOWN_SLUGS: OperacionModuleSlug[] = [
  "tpv",
  "cocina",
  "barra",
  "sala",
  "reservas",
];

const menuGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
  width: "100%",
  marginTop: 20,
};

const menuLinkStyle: CSSProperties = {
  padding: "36px 20px",
  borderRadius: 22,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background:
    "linear-gradient(180deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.78) 100%)",
  color: "#e0f2fe",
  fontWeight: 700,
  fontSize: 22,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  minHeight: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  textDecoration: "none",
  boxShadow:
    "0 1px 0 rgba(148, 163, 184, 0.08) inset, 0 12px 32px rgba(2, 6, 23, 0.35)",
  transition:
    "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, background 120ms ease",
  WebkitTapHighlightColor: "transparent",
};

const menuResponsiveCss = `
.op-menu-link:hover {
  border-color: rgba(56, 189, 248, 0.45);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.18) 0%, rgba(15, 23, 42, 0.78) 100%);
}
.op-menu-link:active {
  transform: scale(0.98);
  box-shadow: 0 1px 0 rgba(148, 163, 184, 0.08) inset, 0 6px 18px rgba(2, 6, 23, 0.45);
}
.op-menu-link:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.7);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .op-menu-grid > .op-menu-link:nth-child(odd):last-child {
    grid-column: 1 / -1;
    width: calc(50% - 8px);
    justify-self: center;
  }
}

@media (min-width: 768px) {
  .op-menu-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .op-menu-link {
    min-height: 140px;
    font-size: 24px;
    padding: 44px 20px;
    border-radius: 24px;
  }
}
`;

function isKnownSlug(value: string | null): value is OperacionModuleSlug {
  return value !== null && (KNOWN_SLUGS as string[]).includes(value);
}

export default function OperacionMenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyTab = searchParams.get("tab");
  const shouldRedirect = isKnownSlug(legacyTab);

  useEffect(() => {
    if (!shouldRedirect || !legacyTab) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("tab");
    const qs = next.toString();
    router.replace(`/dashboard/operacion/${legacyTab}${qs ? `?${qs}` : ""}`);
  }, [shouldRedirect, legacyTab, searchParams, router]);

  if (shouldRedirect) {
    return null;
  }

  return (
    <ModulePageShell
      title="Operación"
      subtitle="Flujo diario del servicio"
      maxWidth={1400}
      compactLayout
    >
      <style dangerouslySetInnerHTML={{ __html: menuResponsiveCss }} />
      <nav
        aria-label="Módulos de operación"
        className="op-menu-grid"
        style={menuGridStyle}
      >
        {MODULES.map((m) => (
          <Link
            key={m.slug}
            href={`/dashboard/operacion/${m.slug}`}
            className="op-menu-link"
            style={menuLinkStyle}
          >
            {m.label}
          </Link>
        ))}
      </nav>
    </ModulePageShell>
  );
}
