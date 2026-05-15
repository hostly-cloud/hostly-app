"use client";

import ZonasManagement from "@/components/zonas/zonas-management";

export default function ConfigEspaciosZonasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Zonas
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
          Espacios · Zonas del local y asignación operativa.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <ZonasManagement />
      </div>
    </div>
  );
}
