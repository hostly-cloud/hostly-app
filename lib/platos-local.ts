/**
 * Compatibilidad temporal del antiguo módulo de platos.
 *
 * El contrato de producto vive en `lib/carta/product-sale-contract.ts`.
 * La persistencia histórica del navegador vive en
 * `lib/carta/legacy-platos-storage.ts` y no debe considerarse fuente operativa.
 *
 * Nuevos consumidores no deben importar desde este archivo.
 */

export {
  TIPOS_PRODUCTO_VENTA,
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
  type PlatoCarta,
  type TipoProductoVenta,
} from "@/lib/carta/product-sale-contract";

export {
  PLATOS_CHANGED_EVENT,
  createPlatoDraft,
  loadPlatos,
  savePlatos,
} from "@/lib/carta/legacy-platos-storage";
