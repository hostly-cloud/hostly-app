import type { ComensalesSelectorsKpis } from "@/components/analysis/hooks/useComensalesSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";

export type ComensalesKpiBlockData = ComensalesSelectorsKpis;

type ComensalesKpiBlockProps = {
  data: ComensalesSelectorsKpis;
};

export function ComensalesKpiBlock({ data }: ComensalesKpiBlockProps) {
  const { booked, seated, completed, noShow, cancelled, paxPlanned, paxSeated, paxCompleted } = data;

  return (
    <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics">
      <HostlyKpiCard title="Previstas" value={booked} accentColor="#fbbf24" />
      <HostlyKpiCard title="Llegadas" value={seated} accentColor="#38bdf8" />
      <HostlyKpiCard title="Completadas" value={completed} accentColor="#22c55e" />
      <HostlyKpiCard title="Ausencias" value={noShow} accentColor="#f87171" />
      <HostlyKpiCard title="Canceladas" value={cancelled} accentColor="#94a3b8" />
      <HostlyKpiCard title="Pax previstas" value={paxPlanned} variant="soft" />
      <HostlyKpiCard title="Pax llegadas" value={paxSeated} variant="soft" />
      <HostlyKpiCard title="Pax completadas" value={paxCompleted} variant="soft" />
    </div>
  );
}
