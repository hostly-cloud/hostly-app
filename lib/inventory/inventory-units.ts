export type InventoryUnit = "kg" | "g" | "l" | "ml" | "uds";

export const INVENTORY_UNITS: readonly InventoryUnit[] = ["kg", "g", "l", "ml", "uds"] as const;

export function isInventoryUnit(value: unknown): value is InventoryUnit {
  return value === "kg" || value === "g" || value === "l" || value === "ml" || value === "uds";
}
