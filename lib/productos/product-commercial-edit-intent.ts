let pendingProductId: string | null = null;

/**
 * Marca una apertura inmediata de la información comercial para el producto.
 * La intención vive solo en memoria del cliente y se consume una única vez al
 * montar el modal del producto seleccionado.
 */
export function requestProductCommercialEdit(productId: string): void {
  const normalized = productId.trim();
  pendingProductId = normalized || null;
}

export function consumeProductCommercialEdit(productId: string | null | undefined): boolean {
  const normalized = productId?.trim() ?? "";
  if (!normalized || pendingProductId !== normalized) return false;
  pendingProductId = null;
  return true;
}
