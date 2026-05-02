import type { CSSProperties } from "react";

const boxStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 42, 0.35)",
};

const textStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
  lineHeight: 1.45,
};

export type VentasViewStateProps = {
  hasOrders: boolean;
  ordersCount: number;
};

export function VentasViewState({ hasOrders, ordersCount }: VentasViewStateProps) {
  const message = hasOrders
    ? `Se han detectado ${ordersCount} pedidos para esta vista.`
    : "Todavía no hay pedidos conectados a esta pestaña.";

  return (
    <div style={boxStyle}>
      <p style={{ ...textStyle, margin: 0 }}>{message}</p>
    </div>
  );
}
