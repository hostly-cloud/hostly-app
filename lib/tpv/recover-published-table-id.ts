import type { Table } from "@/lib/firestore/tables";

function normalizeIdentity(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("es");
}

function isOperationalTable(table: Table): boolean {
  return (
    table.isActive !== false &&
    table.type !== "wall" &&
    table.type !== "bar" &&
    table.type !== "column" &&
    table.type !== "pool" &&
    table.type !== "door" &&
    table.type !== "planter"
  );
}

/**
 * Recupera el documento operativo de una instancia publicada que perdió su
 * `legacyTableId`. Los nombres de mesa solo deben ser únicos dentro de cada
 * plano: "Mesa 2" puede existir legítimamente en Sala, Terraza y Jardín.
 */
export function recoverPublishedTableIdByPlan(params: {
  instanceName: unknown;
  floorPlanId: unknown;
  tables: Table[];
}): string {
  const name = normalizeIdentity(params.instanceName);
  if (!name) return "";

  const floorPlanId = String(params.floorPlanId ?? "").trim();
  const sameName = params.tables.filter(
    (table) => isOperationalTable(table) && normalizeIdentity(table.name) === name,
  );

  if (floorPlanId) {
    const samePlan = sameName.filter(
      (table) => String(table.floorPlanId ?? "").trim() === floorPlanId,
    );
    if (samePlan.length === 1) return String(samePlan[0].id ?? "").trim();
    if (samePlan.length > 1) return "";
  }

  return sameName.length === 1 ? String(sameName[0].id ?? "").trim() : "";
}
