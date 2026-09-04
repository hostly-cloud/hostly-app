export type TableOperationalVisualState =
  | "libre"
  | "ocupada"
  | "reservada"
  | "atencion"
  | "critica"
  | "retrasada";

export type TableOperationalReservationPressure = {
  type: "upcoming" | "late";
  time?: string;
} | null;

export type ResolveTableOperationalVisualStateInput = {
  busy: boolean;
  reserved: boolean;
  isCriticalTable: boolean;
  priorityLevel: number;
  readyToClose: boolean;
  reservationPressure: TableOperationalReservationPressure | undefined;
};

/**
 * Resuelve el estado operativo semántico de una mesa a partir de señales ya calculadas.
 * Precedencia productiva (sin cambios): critica → retrasada → atencion → ocupada → reservada → libre.
 */
export function resolveTableOperationalVisualState(
  params: ResolveTableOperationalVisualStateInput,
): TableOperationalVisualState {
  if (params.isCriticalTable || params.priorityLevel >= 3) return "critica";
  if (params.reservationPressure?.type === "late") return "retrasada";
  if (
    params.priorityLevel === 1 ||
    params.priorityLevel === 2 ||
    params.readyToClose ||
    params.reservationPressure?.type === "upcoming"
  ) {
    return "atencion";
  }
  if (params.busy) return "ocupada";
  if (params.reserved) return "reservada";
  return "libre";
}

export function tableOperationalVisualStateLabel(
  state: TableOperationalVisualState,
): string {
  switch (state) {
    case "ocupada":
      return "Ocupada";
    case "reservada":
      return "Reservada";
    case "atencion":
      return "Requiere atención";
    case "critica":
      return "Crítica";
    case "retrasada":
      return "Reserva retrasada";
    default:
      return "Libre";
  }
}
