import type { Mesa } from "@/types/mesa";

type MesaHeaderProps = {
  mesa: Mesa | null;
  totalItemsCount: number;
  orderTotal: number;
  orderStatusLabel: string;
  orderStatusColor: string;
  orderStatus: "open" | "sent" | "closed" | null;
  busyLabel: string | null;
};

export function MesaHeader({
  mesa,
  totalItemsCount,
  orderTotal,
  orderStatusLabel,
  orderStatusColor,
  orderStatus,
  busyLabel,
}: MesaHeaderProps) {
  return (
    <>
      <h2 style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{mesa?.name ?? "Mesa"}</span>

          {totalItemsCount > 0 && (
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#374151",
                color: "#fff",
              }}
            >
              {totalItemsCount} items
            </span>
          )}

          {orderTotal > 0 && (
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#065f46",
                color: "#fff",
              }}
            >
              {orderTotal.toFixed(2)} €
            </span>
          )}
        </div>
      </h2>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          marginBottom: 16,
          padding: "6px 10px",
          borderRadius: 999,
          background: orderStatusColor,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {orderStatusLabel}
      </div>

      {orderStatus === "sent" && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(37, 99, 235, 0.15)",
            color: "#93c5fd",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Comanda enviada a cocina
        </div>
      )}

      {busyLabel && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(245, 158, 11, 0.15)",
            color: "#fbbf24",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {busyLabel}
        </div>
      )}

      {mesa && (
        <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.75 }}>
          {mesa.zone} · {mesa.capacity} pax
        </div>
      )}
    </>
  );
}

