import type { TipoProductoVenta } from "@/lib/platos-local";

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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Simula visión + extracción desde foto de carta (sustituir por API real).
 * Devuelve filas con agrupación aproximada por categoría.
 */
export async function mockExtractMenuFromPhoto(_file: File): Promise<ExtractedMenuRow[]> {
  // Demo creíble: rápido para que el "paso 2" controle la duración total.
  await delay(380 + Math.random() * 320);

  // Demo pensada para “paso 2/3” con señales de revisión reales:
  // - duplicado, precio dudoso, sin precio, categoría dudosa, nombre incompleto
  const raw: Omit<ExtractedMenuRow, "tempId" | "selected">[] = [
    { nombre: "Ensaladilla rusa", categoria: "Entrantes", precio: 8.5, tipoVenta: "plato", familia: "Entrantes fríos", disponible: true },
    { nombre: "Croquetas caseras", categoria: "Entrantes", precio: 9.0, tipoVenta: "plato", familia: "Entrantes calientes", disponible: true },
    { nombre: "Croquetas…", categoria: "Entrantes", precio: 9.0, tipoVenta: "plato", familia: "Entrantes calientes", disponible: true, iaNotes: ["Nombre incompleto: revisa el detalle (ración, unidades)."] },
    { nombre: "Calamares a la romana", categoria: "Entrantes", precio: 11.5, tipoVenta: "plato", familia: "Fritos", disponible: true },
    { nombre: "Hamburguesa premium", categoria: "Principales", precio: 12.9, tipoVenta: "plato", familia: "Hamburguesas", disponible: true },
    { nombre: "Hamburguesa", categoria: "Principales", precio: 25.0, tipoVenta: "plato", familia: "Hamburguesas", disponible: true, issues: ["price_suspicious"], iaNotes: ["Precio alto para la familia: revisa si es menú o doble."] },
    { nombre: "Lubina al horno", categoria: "Pescados", precio: 16.5, tipoVenta: "plato", familia: "Pescados", disponible: true },
    { nombre: "Paella mixta (mín. 2)", categoria: "Arroces", precio: 14.0, tipoVenta: "plato", familia: "Arroces", disponible: true },
    { nombre: "Coca-Cola", categoria: "Refrescos", precio: 2.5, tipoVenta: "bebida", familia: "Refrescos", disponible: true },
    { nombre: "Agua 50cl", categoria: "Aguas", precio: 2.2, tipoVenta: "bebida", familia: "Aguas", disponible: true },
    { nombre: "Agua 50 cl", categoria: "Aguas", precio: 2.2, tipoVenta: "bebida", familia: "Aguas", disponible: true, issues: ["duplicate"], iaNotes: ["Posible duplicado: misma bebida con nombre alternativo."] },
    { nombre: "Copa de vino tinto", categoria: "Vinos", precio: 3.8, tipoVenta: "bebida", familia: "Vinos por copa", disponible: true, categoryLowConfidence: true, iaNotes: ["Categoría sugerida con baja confianza: comprueba si va en 'Vinos' o 'Bodega'."] },
    { nombre: "Café solo", categoria: "Cafés", precio: 1.8, tipoVenta: "bebida", familia: "Cafés", disponible: true },
    { nombre: "Tarta de queso", categoria: "Postres", precio: 5.9, tipoVenta: "plato", familia: "Postres", disponible: true },
    { nombre: "Tiramisú", categoria: "Postres", precio: 5.9, tipoVenta: "plato", familia: "Postres", disponible: true },
    { nombre: "Tiramisú", categoria: "Postres", precio: 5.9, tipoVenta: "plato", familia: "Postres", disponible: true, issues: ["duplicate"], iaNotes: ["Posible duplicado: revisa si son tamaños distintos."] },
    { nombre: "Pan", categoria: "Extras", precio: NaN, tipoVenta: "plato", familia: "Extras", disponible: true, iaNotes: ["Falta precio: indica PVP o desmarca si no se cobra."] },
  ];

  return raw.map((r, i) => ({
    ...r,
    tempId: `mock-${i}-${Math.random().toString(16).slice(2, 8)}`,
    selected: true,
  }));
}
