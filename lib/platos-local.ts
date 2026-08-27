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
  isTipoProductoVenta,
  parseTipoVentaLoose,
  type PlatoCarta,
  type ProductoVenta,
  type TipoProductoVenta,
} from "@/lib/carta/product-sale-contract";

export {
  PLATOS_CHANGED_EVENT,
  PLATOS_LOCAL_STORAGE_KEY,
  createPlatoDraft,
  loadPlatos,
  newPlatoId,
  savePlatos,
  setPlatoEscandalloId,
  syncPlatoPrecioFromEscandalloSave,
} from "@/lib/carta/legacy-platos-storage";
