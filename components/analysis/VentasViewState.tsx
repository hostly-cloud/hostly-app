export type VentasViewStateProps = {
  hasOrders: boolean;
  ordersCount: number;
};

export function VentasViewState({ hasOrders, ordersCount }: VentasViewStateProps) {
  const message = hasOrders
    ? `${ordersCount} pedidos en el periodo`
    : "Sin pedidos conectados a esta pestaña";

  return (
    <p className="hostly-muted m-0 min-w-0 flex-1 text-xs leading-snug sm:text-[13px]">{message}</p>
  );
}
