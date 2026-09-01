import type { ComensalesSelectorsKpis } from "@/components/analysis/hooks/useComensalesSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";
import {
  Ban,
  BadgeCheck,
  CalendarCheck2,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";

export type ComensalesKpiBlockData = ComensalesSelectorsKpis;

type ComensalesKpiBlockProps = {
  data: ComensalesSelectorsKpis;
};

export function ComensalesKpiBlock({ data }: ComensalesKpiBlockProps) {
  const { booked, seated, completed, noShow, cancelled, paxPlanned, paxSeated, paxCompleted } = data;

  return (
    <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics">
      <HostlyKpiCard title="Previstas" value={booked} icon={<CalendarCheck2 size={17} />} className="hostly-analysis-kpi hostly-analysis-kpi--warning" />
      <HostlyKpiCard title="Llegadas" value={seated} icon={<UserRoundCheck size={17} />} className="hostly-analysis-kpi hostly-analysis-kpi--primary" />
      <HostlyKpiCard title="Completadas" value={completed} icon={<BadgeCheck size={17} />} className="hostly-analysis-kpi hostly-analysis-kpi--success" />
      <HostlyKpiCard title="Ausencias" value={noShow} icon={<UserRoundX size={17} />} className="hostly-analysis-kpi hostly-analysis-kpi--danger" />
      <HostlyKpiCard title="Canceladas" value={cancelled} icon={<Ban size={17} />} className="hostly-analysis-kpi" />
      <HostlyKpiCard title="Pax previstas" value={paxPlanned} icon={<UsersRound size={17} />} variant="soft" className="hostly-analysis-kpi" />
      <HostlyKpiCard title="Pax llegadas" value={paxSeated} icon={<UsersRound size={17} />} variant="soft" className="hostly-analysis-kpi" />
      <HostlyKpiCard title="Pax completadas" value={paxCompleted} icon={<UsersRound size={17} />} variant="soft" className="hostly-analysis-kpi" />
    </div>
  );
}
