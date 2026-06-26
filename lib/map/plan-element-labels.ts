import type { PlanElementType } from "@/lib/firestore/tables";

export function planTypeLabelEs(type: PlanElementType): string {
  switch (type) {
    case "sunbed":
      return "Hamaca";
    case "bed":
      return "Cama";
    case "wall":
      return "Pared";
    case "bar":
      return "Barra";
    case "column":
      return "Columna";
    case "pool":
      return "Piscina";
    case "door":
      return "Puerta";
    case "planter":
      return "Jardinera";
    case "custom":
      return "Personalizado";
    default:
      return "Mesa";
  }
}

export function isTableLikePlanElement(type: PlanElementType): boolean {
  return (
    type === "table" ||
    type === "sunbed" ||
    type === "bed" ||
    type === "custom"
  );
}

export function resolvePlanElementDisplayName(input: {
  type: PlanElementType;
  name?: string | null;
}): string {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  return name || planTypeLabelEs(input.type);
}
