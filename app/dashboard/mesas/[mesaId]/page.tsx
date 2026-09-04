import { redirect } from "next/navigation";
import {
  buildLegacyRouteDestination,
  type LegacyRouteSearchParams,
} from "@/lib/navigation/legacy-route-redirect";

export default async function LegacyMesaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesaId: string }>;
  searchParams: Promise<LegacyRouteSearchParams>;
}) {
  const { mesaId } = await params;
  redirect(
    buildLegacyRouteDestination(
      "/dashboard/operacion/tpv",
      await searchParams,
      { tableId: mesaId },
    ),
  );
}
