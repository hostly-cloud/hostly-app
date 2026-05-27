"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OperationFilterProvider } from "@/components/kds/operation-filter-context";

/**
 * Comparte el `OperationFilterProvider` entre la pantalla menú y todos los módulos hijos
 * (`tpv`, `cocina`, `barra`, `cocteleria`, `sala`, `reservas`, `activity`, `sesiones`). Así los filtros (camarero / zona) y las
 * suscripciones de Firestore (waiters, tables) se montan una sola vez y se conservan al
 * navegar entre módulos.
 */
export default function OperacionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key.toLowerCase();

      if (key === "c") {
        router.push("/dashboard/operacion/cocina");
      }

      if (key === "b") {
        router.push("/dashboard/operacion/barra");
      }

      if (key === "s") {
        router.push("/dashboard/operacion/sala");
      }
    };

    window.addEventListener("keydown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  return (
    <OperationFilterProvider>
      {children}
    </OperationFilterProvider>
  );
}
