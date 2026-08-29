import type { Table } from "@/lib/firestore/tables";
import { stableOperationalTableIdFromEditorInstance } from "@/lib/sala-editor/identity/operational-table-identity";

function identityFromTable(table: Table): string {
  return String(table.editorV2InstanceId ?? table.editorV2ElementId ?? "").trim();
}

/**
 * Resuelve una instancia publicada exclusivamente por identidad estable.
 * No usa nombre, número, espacio ni posición como sustitutos de identidad.
 */
export function resolvePublishedOperationalTableId(params: {
  explicitTableId: unknown;
  instanceId: unknown;
  tables: Table[];
}): string {
  const explicitTableId = String(params.explicitTableId ?? "").trim();
  if (explicitTableId) return explicitTableId;

  const instanceId = String(params.instanceId ?? "").trim();
  if (!instanceId) return "";

  const sameInstance = params.tables.filter(
    (table) => table.isActive !== false && identityFromTable(table) === instanceId,
  );
  if (sameInstance.length === 1) return String(sameInstance[0].id ?? "").trim();
  if (sameInstance.length > 1) return "";

  const deterministicId = stableOperationalTableIdFromEditorInstance(instanceId);
  const deterministicTable = params.tables.find(
    (table) =>
      table.isActive !== false && String(table.id ?? "").trim() === deterministicId,
  );
  return deterministicTable ? deterministicId : "";
}
