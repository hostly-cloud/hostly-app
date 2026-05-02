/**
 * Aplica una compra recibida al inventario en Firestore (transacción atómica).
 * Idempotente: si `aplicadoStock` ya es true, no vuelve a sumar cantidades.
 * Listo para reutilizar desde Cloud Functions con la misma firma.
 */

import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { FirestoreCompra, FirestoreCompraItem } from "@/lib/hostly/firestore-types";

export type ApplyReceivedCompraInput = {
  restauranteId: string;
  compraId: string;
  /** Datos enviados por el cliente para crear o actualizar la compra antes de aplicar. */
  upsert: Omit<FirestoreCompra, "updatedAt" | "createdAt">;
  usuarioId?: string | null;
};

export type ApplyReceivedCompraOk = {
  ok: true;
  alreadyApplied: boolean;
  aplicadoStock: boolean;
  productUpdates: Array<{ productoId: string; cantidadActual: number }>;
  skippedProductIds: string[];
};

export type ApplyReceivedCompraErr = {
  ok: false;
  code: string;
  skippedProductIds?: string[];
};

export type ApplyReceivedCompraResult = ApplyReceivedCompraOk | ApplyReceivedCompraErr;

function mergeItems(existing: FirestoreCompraItem[] | undefined, incoming: FirestoreCompraItem[] | undefined): FirestoreCompraItem[] {
  if (incoming && incoming.length > 0) return incoming;
  return existing && existing.length > 0 ? existing : [];
}

function pickProductCantidad(data: Record<string, unknown>): number {
  const ca = data.cantidadActual;
  if (typeof ca === "number" && Number.isFinite(ca)) return ca;
  const legacy = data.stock_actual;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return legacy;
  return 0;
}

export async function applyReceivedCompraToStock(db: Firestore, input: ApplyReceivedCompraInput): Promise<ApplyReceivedCompraResult> {
  const { restauranteId, compraId, upsert, usuarioId } = input;
  const root = db.collection("restaurantes").doc(restauranteId);
  const compraRef = root.collection("compras").doc(compraId);
  const movCol = root.collection("movimientosStock");

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(compraRef);

    let doc: FirestoreCompra;

    if (!snap.exists) {
      doc = {
        restauranteId,
        proveedor: upsert.proveedor,
        estado: upsert.estado,
        fecha: upsert.fecha,
        total: upsert.total,
        notas: upsert.notas,
        items: mergeItems(undefined, upsert.items),
        aplicadoStock: false,
      };
      tx.set(compraRef, {
        ...doc,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const existing = snap.data() as FirestoreCompra;
      if (existing.aplicadoStock === true) {
        return {
          ok: true,
          alreadyApplied: true,
          aplicadoStock: true,
          productUpdates: [],
          skippedProductIds: [],
        };
      }
      const items = mergeItems(existing.items, upsert.items);
      doc = {
        ...existing,
        proveedor: upsert.proveedor,
        estado: upsert.estado,
        fecha: upsert.fecha,
        total: upsert.total,
        notas: upsert.notas,
        items,
        restauranteId,
      };
      tx.update(compraRef, {
        proveedor: doc.proveedor,
        estado: doc.estado,
        fecha: doc.fecha,
        total: doc.total,
        items: doc.items,
        updatedAt: FieldValue.serverTimestamp(),
        ...(doc.notas != null && String(doc.notas).trim() !== "" ? { notas: doc.notas } : {}),
      });
    }

    if (doc.aplicadoStock === true) {
      return {
        ok: true,
        alreadyApplied: true,
        aplicadoStock: true,
        productUpdates: [],
        skippedProductIds: [],
      };
    }

    if (doc.estado !== "recibido") {
      return { ok: false, code: "NOT_RECEIVED" };
    }

    const items = doc.items ?? [];
    const validLines = items.filter(
      (i) => i.productoId?.trim() && typeof i.cantidad === "number" && Number.isFinite(i.cantidad) && i.cantidad > 0,
    );

    if (validLines.length === 0) {
      tx.update(compraRef, {
        aplicadoStock: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        ok: true,
        alreadyApplied: false,
        aplicadoStock: true,
        productUpdates: [],
        skippedProductIds: [],
      };
    }

    const skippedProductIds: string[] = [];
    const productUpdates: Array<{ productoId: string; cantidadActual: number }> = [];

    type Row = { item: FirestoreCompraItem; ref: DocumentReference; data: Record<string, unknown> };
    const rows: Row[] = [];

    for (const item of validLines) {
      const pref = root.collection("productos").doc(item.productoId.trim());
      const ps = await tx.get(pref);
      if (!ps.exists) {
        skippedProductIds.push(item.productoId);
        continue;
      }
      const data = ps.data() as Record<string, unknown>;
      const rid = data.restauranteId;
      if (rid != null && rid !== restauranteId) {
        skippedProductIds.push(item.productoId);
        continue;
      }
      rows.push({ item, ref: pref, data });
    }

    if (rows.length === 0) {
      return {
        ok: false,
        code: "ALL_PRODUCTS_MISSING",
        skippedProductIds,
      };
    }

    for (const row of rows) {
      const current = pickProductCantidad(row.data);
      const next = current + row.item.cantidad;
      tx.update(row.ref, {
        cantidadActual: next,
        ultimaReposicion: FieldValue.serverTimestamp(),
        restauranteId,
      });
      const movRef = movCol.doc();
      tx.set(movRef, {
        restauranteId,
        productoId: row.item.productoId,
        tipo: "compra",
        cantidad: row.item.cantidad,
        referenciaId: compraId,
        fecha: FieldValue.serverTimestamp(),
        usuarioId: usuarioId ?? null,
      });
      productUpdates.push({ productoId: row.item.productoId, cantidadActual: next });
    }

    tx.update(compraRef, {
      aplicadoStock: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      alreadyApplied: false,
      aplicadoStock: true,
      productUpdates,
      skippedProductIds,
    };
  });
}
