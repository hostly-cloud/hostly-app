import { redirect } from "next/navigation";
import {
  buildLegacyRouteDestination,
  type LegacyRouteSearchParams,
} from "@/lib/navigation/legacy-route-redirect";

export default async function LegacyStockPage({
  searchParams,
}: {
  searchParams: Promise<LegacyRouteSearchParams>;
}) {
  redirect(
    buildLegacyRouteDestination("/dashboard/inventario", await searchParams),
  );
}
