import type { TipoProductoVenta } from "@/lib/carta/product-sale-contract";

export type ExtractedMenuRow = {
  tempId: string;
  nombre: string;
  categoria: string;
  precio: number;
  tipoVenta: TipoProductoVenta;
  /** Incluir al confirmar (usuario puede desmarcar). */
  selected: boolean;
  /** Decisión de negocio cuando hay duplicados. */
  action?: "create_new" | "use_existing" | "update_existing" | "ignore" | "pending_review";
  /** Producto existente seleccionado para usar/actualizar (si aplica). */
  targetPlatoId?: string | null;
  /** Candidatos detectados contra el catálogo actual (por restaurante). */
  potentialDuplicates?: { platoId: string; score: number; reasons: string[] }[];
  /**
   * Señales mock para demo visual (sin backend).
   * Se usan para badges tipo “posible duplicado” o “precio dudoso”.
   */
  issues?: ("duplicate" | "price_suspicious")[];
  /** Campo auxiliar demo: categoría sugerida con baja confianza. */
  categoryLowConfidence?: boolean;
  /** Familia/grupo para aplicar cambios en bloque (demo). */
  familia?: string;
  /** Notas/avisos IA (demo). */
  iaNotes?: string[];
  /** Disponibilidad en carta (demo). */
  disponible?: boolean;
};

/**
 * @deprecated No usar en producción. Solo conserva el tipo ExtractedMenuRow.
 * La extracción real va por `/api/ai/import-menu` + validación OCR.
 */
export async function mockExtractMenuFromPhoto(_file: File): Promise<ExtractedMenuRow[]> {
  throw new Error("MOCK_MENU_IMPORT_DISABLED");
}
