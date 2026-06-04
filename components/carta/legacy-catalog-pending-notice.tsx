"use client";

import Link from "next/link";
import { countLegacyPlatosForRestaurant } from "@/lib/carta/legacy-platos-client";
import type { OperationalCatalogSource } from "@/lib/carta/use-central-products-for-carta";

type LegacyCatalogPendingNoticeProps = {
  restaurantId: string;
  catalogSource: OperationalCatalogSource | null;
  className?: string;
};

/**
 * Aviso discreto cuando el catálogo central está activo pero quedan platos en `hostly.platos.v1`.
 */
export function LegacyCatalogPendingNotice({
  restaurantId,
  catalogSource,
  className,
}: LegacyCatalogPendingNoticeProps) {
  if (catalogSource !== "central") return null;

  const count = countLegacyPlatosForRestaurant(restaurantId);
  if (count <= 0) return null;

  return (
    <div
      className={[
        "hostly-carta-config-alert hostly-carta-config-alert--warning",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-legacy-catalog-pending-notice=""
    >
      Hay {count} producto{count === 1 ? "" : "s"} antiguo{count === 1 ? "" : "s"} pendiente
      {count === 1 ? "" : "s"} de migrar en este navegador.{" "}
      <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
        Revísalos en Productos
      </Link>{" "}
      antes de limpiar datos.
    </div>
  );
}
