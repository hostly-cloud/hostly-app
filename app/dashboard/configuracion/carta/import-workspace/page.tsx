import { redirect } from "next/navigation";
import {
  buildLegacyRouteDestination,
  type LegacyRouteSearchParams,
} from "@/lib/navigation/legacy-route-redirect";

export default async function LegacyImportWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<LegacyRouteSearchParams>;
}) {
  redirect(
    buildLegacyRouteDestination(
      "/dashboard/configuracion/carta/importacion",
      await searchParams,
    ),
  );
}
