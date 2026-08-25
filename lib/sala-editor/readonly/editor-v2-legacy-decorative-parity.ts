import {
  isDecorativePlanElementType,
  type Table,
} from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";

/**
 * IDs de objetos visuales que Editor V2 ya renderiza de forma nativa.
 * No incluye zonas ni objetos operativos: esta utilidad solo sustituye la capa
 * decorativa legacy de EditableFloorMap.
 */
export function getEditorV2NativeDecorativeIds(
  contract: EditorTpvReadonlyVisualContract,
): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = typeof value === "string" ? value.trim() : "";
    if (id) ids.add(id);
  };

  for (const item of contract.surfaces) add(item.id);
  for (const item of contract.walls) add(item.id);
  for (const item of contract.wallAttachments) add(item.id);
  for (const item of contract.structuralElements) add(item.id);
  for (const item of contract.landscapeElements) add(item.id);

  return [...ids].sort();
}

/**
 * Paridad conservadora: solo considera sustituible un decorativo legacy cuando
 * su `editorV2ElementId` o, en documentos hidratados, su propio `id`, existe
 * exactamente entre los objetos visuales del contrato V2 actual.
 */
export function isLegacyDecorativeCoveredByEditorV2(
  element: Pick<Table, "id" | "type" | "editorV2ElementId">,
  nativeDecorativeIds: ReadonlySet<string>,
): boolean {
  if (!isDecorativePlanElementType(element.type)) return false;

  const editorV2ElementId = element.editorV2ElementId?.trim() ?? "";
  if (editorV2ElementId && nativeDecorativeIds.has(editorV2ElementId)) {
    return true;
  }

  const legacyId = element.id.trim();
  return legacyId !== "" && nativeDecorativeIds.has(legacyId);
}

function cssAttributeString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Suprime solo decorativos legacy cuyo ID coincide exactamente con un objeto
 * visual presente en el contrato V2. Si no hay paridad exacta, no se oculta.
 * La fachada de EditableFloorMap aplica además `editorV2ElementId` antes del render.
 */
export function buildEditorV2LegacyDecorativeSuppressionCss(
  contract: EditorTpvReadonlyVisualContract,
): string {
  return getEditorV2NativeDecorativeIds(contract)
    .map(
      (id) =>
        `[data-hostly-readonly-decorative-id=${cssAttributeString(id)}]{display:none!important;}`,
    )
    .join("\n");
}
