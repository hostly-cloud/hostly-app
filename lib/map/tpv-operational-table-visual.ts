/**
 * TPV operativo: escala visual de mesas en pantalla sin mutar datos Firestore.
 * Preserva el centro lógico del elemento para tap/click y etiquetas.
 */

/** Factor sobre el tamaño lógico del plano (solo render TPV). */
export const TPV_OPERATIONAL_TABLE_VISUAL_SCALE = 1.9;

/** Mínimo táctil en coords lógicas del plano (px). */
export const TPV_OPERATIONAL_TABLE_MIN_WIDTH = 180;
export const TPV_OPERATIONAL_TABLE_MIN_HEIGHT = 150;

export type TpvOperationalTableVisualLayout = {
  mapLayoutX: number;
  mapLayoutY: number;
  mapTileWidth: number;
  mapTileHeight: number;
};

/**
 * Devuelve posición/tamaño de render ampliados, centrados sobre el rect lógico original.
 */
export function resolveTpvOperationalTableVisualLayout(
  layoutX: number,
  layoutY: number,
  width: number,
  height: number,
  options?: {
    scale?: number;
    minWidth?: number;
    minHeight?: number;
  },
): TpvOperationalTableVisualLayout {
  const scale = options?.scale ?? TPV_OPERATIONAL_TABLE_VISUAL_SCALE;
  const minWidth = options?.minWidth ?? TPV_OPERATIONAL_TABLE_MIN_WIDTH;
  const minHeight = options?.minHeight ?? TPV_OPERATIONAL_TABLE_MIN_HEIGHT;

  const baseW = Math.max(1, width);
  const baseH = Math.max(1, height);

  const mapTileWidth = Math.max(baseW * scale, minWidth);
  const mapTileHeight = Math.max(baseH * scale, minHeight);

  return {
    mapLayoutX: layoutX + (baseW - mapTileWidth) / 2,
    mapLayoutY: layoutY + (baseH - mapTileHeight) / 2,
    mapTileWidth,
    mapTileHeight,
  };
}
