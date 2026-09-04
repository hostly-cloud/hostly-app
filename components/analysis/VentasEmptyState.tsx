import { AnalyticsEmptyState } from "@/components/analysis/AnalyticsEmptyState";
import { Clock3, ReceiptText, TriangleAlert } from "lucide-react";

export type VentasEmptyStateProps = {
  placeholder?: string;
  role?: "status" | "alert";
};

export function VentasEmptyState({ placeholder, role }: VentasEmptyStateProps) {
  const isError = role === "alert";
  const isLoading = role === "status";

  return (
    <AnalyticsEmptyState
      compact
      role={role}
      icon={
        isError ? (
          <TriangleAlert size={22} strokeWidth={2.1} />
        ) : isLoading ? (
          <Clock3 size={22} strokeWidth={2.1} />
        ) : (
          <ReceiptText size={22} strokeWidth={2.1} />
        )
      }
      title={isError ? "No pudimos cargar los cobros" : isLoading ? "Actualizando ventas" : "Aún no hay cobros"}
      description={placeholder ?? "No hay cobros confirmados en este periodo."}
      hint={
        isError || isLoading
          ? undefined
          : "Cuando confirmes un cobro, aquí verás ingresos, ticket medio y evolución."
      }
    />
  );
}
