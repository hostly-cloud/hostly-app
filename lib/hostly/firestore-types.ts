/**
 * Formas de documento Firestore para Compras → Stock (Hostly).
 * Rutas: restaurantes/{restauranteId}/productos|compras|movimientosStock
 */

import type { Timestamp } from "firebase-admin/firestore";

export type FirestoreUnidadStock = "kg" | "g" | "l" | "ml" | "uds";

export type FirestoreCompraItem = {
  productoId: string;
  nombre?: string;
  cantidad: number;
  costeUnitario?: number;
};

export type FirestoreCompra = {
  restauranteId: string;
  proveedor: string;
  estado: "pendiente" | "recibido" | "cancelado";
  fecha: string;
  total: number;
  notas?: string;
  aplicadoStock: boolean;
  items: FirestoreCompraItem[];
};

export type FirestoreProducto = {
  restauranteId: string;
  nombre: string;
  cantidadActual: number;
  stockMinimo?: number;
  unidad?: FirestoreUnidadStock | string;
  ultimaReposicion?: Timestamp | null;
  precioMedioCoste?: number | null;
};

export type FirestoreMovimientoStock = {
  restauranteId: string;
  productoId: string;
  tipo: "compra";
  cantidad: number;
  referenciaId: string;
  fecha: Timestamp;
  usuarioId: string | null;
};
