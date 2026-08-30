import type { Table } from "@/lib/firestore/tables";
import {
  effectiveTableFloorPlanId,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";

export type ReservationTableOption = {
  id: string;
  label: string;
  disabled: boolean;
};

type HistoricalTableReference = {
  tableId?: string;
  tableLabel?: string;
};

function sortReservationTables(a: Table, b: Table): number {
  return a.name.localeCompare(b.name, "es", { numeric: true });
}

function normalizedTableName(table: Table): string {
  return table.name.trim().toLocaleLowerCase("es");
}

/**
 * Mantiene el nombre corto cuando es único. Si dos planos reutilizan el mismo
 * número de mesa, añade el plano (o la zona si falta) para que el selector sea inequívoco.
 */
export function reservationTableDisplayLabels(
  tables: readonly Table[],
  floorPlans: readonly FloorPlan[],
): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const table of tables) {
    const key = normalizedTableName(table);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const floorNames = new Map(
    floorPlans.map((plan) => [plan.id, plan.name.trim()] as const),
  );
  const baseLabels = tables.map((table) => {
    const name = table.name.trim() || "Mesa";
    if ((nameCounts.get(normalizedTableName(table)) ?? 0) < 2) {
      return { id: table.id, label: name };
    }

    const floorId = effectiveTableFloorPlanId(table, null, [...floorPlans]);
    const rawFloorName = floorNames.get(floorId)?.trim() ?? "";
    const floorName = /^\d+$/.test(rawFloorName)
      ? `Plano ${rawFloorName}`
      : rawFloorName;
    const zoneName = (table.zoneName ?? table.zone ?? "").trim();
    const context = floorName || zoneName;
    return { id: table.id, label: context ? `${name} · ${context}` : name };
  });

  const labelCounts = new Map<string, number>();
  for (const item of baseLabels) {
    labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1);
  }
  const occurrences = new Map<string, number>();
  return new Map(
    baseLabels.map((item) => {
      if ((labelCounts.get(item.label) ?? 0) < 2) return [item.id, item.label];
      const occurrence = (occurrences.get(item.label) ?? 0) + 1;
      occurrences.set(item.label, occurrence);
      return [item.id, `${item.label} (${occurrence})`];
    }),
  );
}

export function activeReservationTables(
  tables: readonly Table[],
  restaurantId: string,
): Table[] {
  const rid = restaurantId.trim();
  if (!rid) return [];

  return tables
    .filter(
      (table) =>
        table.restaurantId === rid &&
        table.type === "table" &&
        table.isActive !== false,
    )
    .sort(sortReservationTables);
}

export function reservationTableOptionsForReference(params: {
  activeTables: readonly Table[];
  allTables: readonly Table[];
  restaurantId: string;
  reference: HistoricalTableReference;
}): ReservationTableOption[] {
  const activeOptions = params.activeTables.map((table) => ({
    id: table.id,
    label: table.name,
    disabled: false,
  }));
  const tableId = String(params.reference.tableId ?? "").trim();
  if (!tableId || activeOptions.some((option) => option.id === tableId)) {
    return activeOptions;
  }

  const rid = params.restaurantId.trim();
  const historicalTable = params.allTables.find(
    (table) =>
      table.restaurantId === rid &&
      table.id === tableId &&
      table.type === "table",
  );
  const storedLabel = String(params.reference.tableLabel ?? "").trim();
  const label = historicalTable?.name.trim() || storedLabel || tableId;

  return [
    {
      id: tableId,
      label: `${label} (inactiva)`,
      disabled: true,
    },
    ...activeOptions,
  ];
}
