import type { TableOperationalVisualState } from "@/lib/map/table-operational-state";

/** Color de acento aplicado a la geometría visible de la mesa (glyph). */
export function tableOperationalAccentColor(
  state: TableOperationalVisualState | "seleccionada" | null,
): string | null {
  switch (state) {
    case "seleccionada":
      return "#0ea5e9";
    case "critica":
      return "#b94c46";
    case "retrasada":
      return "#d97706";
    case "atencion":
      return "#b87922";
    case "ocupada":
      return "#25495a";
    case "reservada":
      return "#51425f";
    case "libre":
      return "#264f34";
    case null:
      return null;
  }
}
