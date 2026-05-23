"use client";

import type { ReactNode } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { CAPABILITY_DENIED_MESSAGE } from "@/lib/auth/hostly-capabilities";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";

export function ConfiguracionCapabilityShell({
  children,
}: {
  children: ReactNode;
}) {
  const { can } = useHostlyCapabilities();

  if (!can("settings.manage")) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-6">
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            padding: "20px 22px",
            borderRadius: 14,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(247, 252, 255, 0.96)",
            color: "#475569",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1f2933" }}>
            Acceso restringido
          </h1>
          <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>
            {CAPABILITY_DENIED_MESSAGE}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function UsuariosCapabilityShell({
  children,
}: {
  children: ReactNode;
}) {
  const { can } = useHostlyCapabilities();

  if (!can("users.manage")) {
    return (
      <ModulePageShell title="Usuarios" subtitle="Gestión de accesos">
        <p style={{ color: "#667085", fontSize: 14 }}>{CAPABILITY_DENIED_MESSAGE}</p>
      </ModulePageShell>
    );
  }

  return <>{children}</>;
}
