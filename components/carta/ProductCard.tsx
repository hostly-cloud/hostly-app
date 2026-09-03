"use client";

import Image from "next/image";
import { HostlyButton } from "@/components/ui/hostly";
import type { Product } from "@/types/product";

const thumbBox = {
  width: 72,
  height: 72,
  borderRadius: 8,
  backgroundColor: "#2a2a2a",
  border: "1px solid #444",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#64748b",
  fontSize: 12,
  flexShrink: 0,
  overflow: "hidden",
} as const;

export type ProductCardProps = {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  /** Si es false, no se muestra eliminar (p. ej. rol staff). Por defecto true. */
  canDelete?: boolean;
  onQuickAdd?: (product: Product) => void;
};

export function ProductCard({
  product,
  onEdit,
  onDelete,
  canDelete = true,
  onQuickAdd,
}: ProductCardProps) {
  const precioLabel = Number.isFinite(product.precio)
    ? `${product.precio} €`
    : "Precio no definido";
  const showCategoria = product.categoria.trim() !== "";
  const hasImg = Boolean(product.imageUrl?.trim());

  return (
    <div
      onClick={onQuickAdd ? () => onQuickAdd?.(product) : undefined}
      style={{
        backgroundColor: "#1f1f1f",
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        ...(onQuickAdd ? { cursor: "pointer" as const } : {}),
      }}
    >
      {hasImg ? (
        <Image
          src={product.imageUrl!}
          alt=""
          width={72}
          height={72}
          unoptimized
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            objectFit: "cover",
            border: "1px solid #444",
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={thumbBox}>Sin foto</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: "bold" }}>{product.nombre}</div>
        {showCategoria && (
          <div style={{ fontSize: 14, color: "#c8c8c8", marginTop: 6 }}>
            {product.categoria}
          </div>
        )}
        <div
          style={{
            fontSize: 16,
            color: "#7bed9f",
            marginTop: 8,
          }}
        >
          {precioLabel}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <HostlyButton
            variant="secondary"
            size="compact"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(product);
            }}
          >
            Editar
          </HostlyButton>
          {canDelete ? (
            <HostlyButton
              variant="destructive"
              size="compact"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
            >
              Eliminar
            </HostlyButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
