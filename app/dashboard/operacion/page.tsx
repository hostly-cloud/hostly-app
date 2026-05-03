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
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  width: "100%",
  marginTop: 16,
};

const menuLinkStyle: CSSProperties = {
  padding: "32px 16px",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#e0f2fe",
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: "-0.02em",
  cursor: "pointer",
  minHeight: 110,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  textDecoration: "none",
};

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
      <nav aria-label="Módulos de operación" style={menuGridStyle}>
        {MODULES.map((m) => (
          <Link
            key={m.slug}
            href={`/dashboard/operacion/${m.slug}`}
            style={menuLinkStyle}
          >
            {m.label}
          </Link>
        ))}
      </nav>
    </ModulePageShell>
  );
}
