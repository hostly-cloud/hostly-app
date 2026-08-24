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

function cssAttributeString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Suprime solo decorativos legacy cuyo ID coincide exactamente con un objeto
 * visual presente en el contrato V2. Si no hay paridad exacta, no se oculta.
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
