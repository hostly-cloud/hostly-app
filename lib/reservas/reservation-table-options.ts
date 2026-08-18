import type { Table } from "@/lib/firestore/tables";

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
