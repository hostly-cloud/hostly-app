import { redirect } from "next/navigation";
import {
  buildLegacyRouteDestination,
  type LegacyRouteSearchParams,
} from "@/lib/navigation/legacy-route-redirect";

export default async function LegacyMesasPage({
  searchParams,
}: {
  searchParams: Promise<LegacyRouteSearchParams>;
}) {
  redirect(
    buildLegacyRouteDestination(
      "/dashboard/operacion/tpv",
      await searchParams,
    ),
  );
}
