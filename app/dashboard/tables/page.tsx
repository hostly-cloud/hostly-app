import { redirect } from "next/navigation";

const TPV_HREF = "/dashboard/operacion/tpv";

/**
 * Compatibilidad para enlaces historicos a /dashboard/tables.
 *
 * La seleccion y operacion de mesas vive exclusivamente en el TPV moderno,
 * que consume la representacion canonica del Editor V2. Esta ruta se conserva
 * solo para bookmarks/enlaces antiguos y no mantiene una segunda fuente de
 * verdad para estados, tiempos u ordenes.
 */
export default function LegacyTablesRedirectPage() {
  redirect(TPV_HREF);
}
