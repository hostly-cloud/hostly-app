import { redirect } from "next/navigation";
import {
  buildLegacyRouteDestination,
  type LegacyRouteSearchParams,
} from "@/lib/navigation/legacy-route-redirect";

export default async function LegacyEscandallosPage({
  searchParams,
}: {
  searchParams: Promise<LegacyRouteSearchParams>;
}) {
  redirect(
    buildLegacyRouteDestination(
      "/dashboard/configuracion/carta/escandallos",
      await searchParams,
    ),
  );
}
