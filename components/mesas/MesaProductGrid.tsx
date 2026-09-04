import { HostlyButton } from "@/components/ui/hostly";
import type { CatalogProduct, ComandaItem } from "@/types/comanda";

type MesaProductGridProps = {
  productSearch: string;
  onProductSearchChange: (value: string) => void;

  categories: string[];
  selectedCategory: string;
  onSelectedCategoryChange: (category: string) => void;
  getCategoryCount: (category: string) => number;

  sortedProducts: CatalogProduct[];
  items: ComandaItem[];
  isOrderLocked: boolean;

  onAddItem: (product: CatalogProduct) => void;
};

export function MesaProductGrid({
  productSearch,
  onProductSearchChange,
  categories,
  selectedCategory,
  onSelectedCategoryChange,
  getCategoryCount,
  sortedProducts,
  items,
  isOrderLocked,
  onAddItem,
}: MesaProductGridProps) {
  return (
    <div>
      <input
        value={productSearch}
        onChange={(e) => onProductSearchChange(e.target.value)}
        placeholder="Buscar producto..."
        style={{
          width: "100%",
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 10,
          background: "#111827",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      />

      <div
        style={{
          marginBottom: 8,
          fontSize: 12,
          color: "#9ca3af",
        }}
      >
        {sortedProducts.length} productos visibles
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {categories.map((c) => (
          <HostlyButton
            key={c}
            variant="chip"
            size="compact"
            active={selectedCategory === c}
            onClick={() => onSelectedCategoryChange(c)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: selectedCategory === c ? "#2563eb" : "#374151",
              color: "#fff",
              fontSize: 12,
            }}
          >
            {c} · {getCategoryCount(c)}
          </HostlyButton>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {sortedProducts.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#111827",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            No hay productos para esta búsqueda.
          </div>
        ) : (
          sortedProducts.map((p) => {
            const isInOrder = items.some((item) => item.id === p.id);
            const itemInOrder = items.find((item) => item.id === p.id);

            return (
              <HostlyButton
                key={p.id}
                variant="secondary"
                size="touch"
                onClick={() => onAddItem(p)}
                disabled={isOrderLocked}
                style={{
                  padding: "14px 10px",
                  borderRadius: 12,
                  background: isInOrder ? "#065f46" : "#374151",
                  color: "#fff",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 70,
                  position: "relative",
                  opacity: isOrderLocked ? 0.45 : 1,
                  cursor: isOrderLocked ? "not-allowed" : "pointer",
                }}
              >
                {itemInOrder && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      background: "#111827",
                      color: "#fff",
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 999,
                    }}
                  >
                    x{itemInOrder.qty}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                    marginTop: 4,
                  }}
                >
                  {p.price.toFixed(2)} €
                </div>

                {isInOrder && (
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.8,
                      marginTop: 4,
                    }}
                  >
                    Añadido
                  </div>
                )}
              </HostlyButton>
            );
          })
        )}
      </div>
    </div>
  );
}
