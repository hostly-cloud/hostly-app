"use client";

import { useCallback } from "react";
import {
  activateCentralProduct,
  formatCentralCatalogWriteError,
  setCentralProductPublication,
  updateCentralProduct,
} from "@/lib/firestore/products";
import {
  validateInlineProductName,
  validateInlineProductPrice,
} from "@/lib/productos/product-inline-field-validation";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import { getPublicationFlags } from "@/components/productos/productos-table-cells";

export type ProductTableInlinePersistMessages = {
  errorNombre: string;
  errorPrecio: string;
};

export type ProductTableInlinePersistResult =
  | { ok: true }
  | { ok: false; error: string };

export function useProductTableInlinePersist(args: {
  restaurantId: string;
  isCentralCatalog: boolean;
  messages: ProductTableInlinePersistMessages;
}) {
  const saveName = useCallback(
    async (p: PlatoCarta, rawName: string): Promise<ProductTableInlinePersistResult> => {
      if (!args.isCentralCatalog) {
        return { ok: false, error: "Edición inline disponible solo con catálogo central." };
      }
      const validation = validateInlineProductName(rawName, args.messages.errorNombre);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      if (validation.value === p.nombre.trim()) {
        return { ok: true };
      }
      try {
        await updateCentralProduct(args.restaurantId, p.id, { name: validation.value });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: formatCentralCatalogWriteError(e) };
      }
    },
    [args.isCentralCatalog, args.restaurantId, args.messages.errorNombre],
  );

  const savePrice = useCallback(
    async (p: PlatoCarta, rawPrice: string): Promise<ProductTableInlinePersistResult> => {
      if (!args.isCentralCatalog) {
        return { ok: false, error: "Edición inline disponible solo con catálogo central." };
      }
      const validation = validateInlineProductPrice(rawPrice, args.messages.errorPrecio);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      if (validation.value === p.precioVenta) {
        return { ok: true };
      }
      try {
        await updateCentralProduct(args.restaurantId, p.id, { price: validation.value });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: formatCentralCatalogWriteError(e) };
      }
    },
    [args.isCentralCatalog, args.restaurantId, args.messages.errorPrecio],
  );

  const toggleActive = useCallback(
    async (p: PlatoCarta): Promise<ProductTableInlinePersistResult> => {
      if (!args.isCentralCatalog) {
        return { ok: false, error: "Edición inline disponible solo con catálogo central." };
      }
      const { isActive } = getPublicationFlags(p);
      try {
        if (isActive) {
          await setCentralProductPublication(args.restaurantId, p.id, { active: false });
        } else {
          await activateCentralProduct(args.restaurantId, p.id);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: formatCentralCatalogWriteError(e) };
      }
    },
    [args.isCentralCatalog, args.restaurantId],
  );

  return { saveName, savePrice, toggleActive };
}
