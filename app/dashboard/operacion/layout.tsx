import type { ReactNode } from "react";
import { OperationFilterProvider } from "@/components/kds/operation-filter-context";

/**
 * Comparte el `OperationFilterProvider` entre la pantalla menú y todos los módulos hijos
 * (`tpv`, `cocina`, `barra`, `sala`, `reservas`). Así los filtros (camarero / zona) y las
 * suscripciones de Firestore (waiters, tables) se montan una sola vez y se conservan al
 * navegar entre módulos.
 */
export default function OperacionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <OperationFilterProvider>{children}</OperationFilterProvider>;
}
