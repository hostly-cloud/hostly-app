import type { ComandaItem, PastOrder } from "@/types/comanda";

type MesaOrderHistoryProps = {
  pastOrders: PastOrder[];
  isSentToKitchen: boolean;
  formatOrderDate: (timestamp?: number) => string;
  getOrderItemsCount: (items: ComandaItem[]) => number;
  onRepeatOrder: (items: ComandaItem[]) => void;
};

export function MesaOrderHistory({
  pastOrders,
  isSentToKitchen,
  formatOrderDate,
  getOrderItemsCount,
  onRepeatOrder,
}: MesaOrderHistoryProps) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Historial</div>

      {pastOrders.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.6 }}>Sin pedidos anteriores</div>
      ) : (
        pastOrders
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          .slice(0, 5)
          .map((o) => (
            <div
              key={o.id}
              style={{
                fontSize: 13,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div>{o.total.toFixed(2)} €</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{formatOrderDate(o.createdAt)}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {getOrderItemsCount(o.items)} productos
                </div>
              </div>
              <button
                type="button"
                disabled={isSentToKitchen}
                onClick={() => onRepeatOrder(o.items)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "#374151",
                  color: "#fff",
                  opacity: isSentToKitchen ? 0.45 : 1,
                  cursor: isSentToKitchen ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Repetir
              </button>
            </div>
          ))
      )}
    </div>
  );
}

