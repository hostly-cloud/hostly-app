"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyAlert, HostlySurface } from "@/components/ui/hostly";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

type SoftwareInfo = {
  productName: string;
  systemId: string;
  producerLegalName: string;
  producerNif: string;
  versions: { hostlyVersion: string; fiscalModuleVersion: string; sifVersion: string; aeatSchemaVersion: string };
  responsibleDeclaration: { status: "draft" | "published"; documentUrl: string | null; declaredFiscalModuleVersion: string; signedAt: string | null; signedPlace: string };
};

export default function FiscalResponsibleDeclarationPage() {
  const [software, setSoftware] = useState<SoftwareInfo | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void authenticatedApiFetch("/api/fiscal/software", { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.software) throw new Error("LOAD_FAILED");
          setSoftware(payload.software);
        })
        .catch(() => setError(true));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <ModulePageShell title="Información del software fiscal" backHref="/dashboard/configuracion/fiscal" backLabel="Volver a fiscalidad" maxWidth={900}>
      <div className="space-y-5">
        {error ? <HostlyAlert tone="danger" title="No disponible">No se pudo consultar la información de esta versión.</HostlyAlert> : null}
        {software?.responsibleDeclaration.status !== "published" ? <HostlyAlert tone="warning" title="Declaración pendiente">Esta compilación no está habilitada para producción fiscal. La activación real permanece bloqueada hasta publicar y vincular la declaración responsable de la versión.</HostlyAlert> : <HostlyAlert tone="success" title="Declaración publicada">La declaración responsable vinculada corresponde a esta versión del módulo fiscal.</HostlyAlert>}
        <HostlySurface variant="flat" className="p-5">
          {!software ? <p className="text-sm text-slate-500">Cargando…</p> : <dl className="grid gap-4 sm:grid-cols-2">
            {[ ["Producto", software.productName], ["Identificador SIF", software.systemId], ["Productor", software.producerLegalName], ["NIF del productor", software.producerNif], ["Versión Hostly", software.versions.hostlyVersion], ["Módulo fiscal", software.versions.fiscalModuleVersion], ["Versión SIF", software.versions.sifVersion], ["Esquema AEAT", software.versions.aeatSchemaVersion], ["Fecha de declaración", software.responsibleDeclaration.signedAt ?? "Pendiente"], ["Lugar", software.responsibleDeclaration.signedPlace || "Pendiente"] ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>)}
          </dl>}
          {software?.responsibleDeclaration.documentUrl ? <a href={software.responsibleDeclaration.documentUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Abrir declaración responsable</a> : null}
        </HostlySurface>
        <p className="text-sm text-slate-600">Cada factura conserva además una copia de las versiones exactas que la generaron.</p>
        <Link href="/dashboard/fiscal" className="text-sm font-semibold text-sky-700 underline">Consultar facturas</Link>
      </div>
    </ModulePageShell>
  );
}
