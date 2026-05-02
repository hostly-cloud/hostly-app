import type { ComandaItem } from "@/types/comanda";

type MesaOrderPanelProps = {
  items: ComandaItem[];
  orderTotal: number;
  isOrderLocked: boolean;

  // acciones
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;

  // botones
  canSaveOrder: boolean;
  canSendToKitchen: boolean;
  canCloseOrder: boolean;
  canReopenOrder: boolean;

  isSaving: boolean;
  isSending: boolean;
  isClosing: boolean;
  isReopening: boolean;

  // handlers
  onSave: () => void;
  onSend: () => void;
  onClose: () => void;
  onReopen: () => void;

  actionHint: string;

  // visibilidad (para mantener el mismo render)
  hasOrderId: boolean;
  isSentToKitchen: boolean;
};

export function MesaOrderPanel({
  items,
  orderTotal,
  isOrderLocked,
  onAdd,
  onRemove,
  onClear,
  canSaveOrder,
  canSendToKitchen,
  canCloseOrder,
  canReopenOrder,
  isSaving,
  isSending,
  isClosing,
  isReopening,
  onSave,
  onSend,
  onClose,
  onReopen,
  actionHint,
  hasOrderId,
  isSentToKitchen,
}: MesaOrderPanelProps) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "#111827",
        color: "#e5e7eb",
      }}
    >
      <div>
        {items.length === 0 ? (
          <div style={{ opacity: 0.6 }}>Sin items</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {(item.price * item.qty).toFixed(2)} €
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={isOrderLocked}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#374151",
                    color: "#fff",
                    opacity: isOrderLocked ? 0.45 : 1,
                    cursor: isOrderLocked ? "not-allowed" : "pointer",
                  }}
                >
                  -
                </button>

                <div style={{ minWidth: 24, textAlign: "center" }}>
                  {item.qty}
                </div>

                <button
                  type="button"
                  onClick={() => onAdd(item.id)}
                  disabled={isOrderLocked}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#374151",
                    color: "#fff",
                    opacity: isOrderLocked ? 0.45 : 1,
                    cursor: isOrderLocked ? "not-allowed" : "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
        }}
      >
        <span>Total</span>
        <span>{orderTotal.toFixed(2)} €</span>
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "#9ca3af",
        }}
      >
        {actionHint}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          disabled={isOrderLocked}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            borderRadius: 8,
            background: "#374151",
            color: "#fff",
            fontWeight: 600,
            opacity: isOrderLocked ? 0.45 : 1,
            cursor: isOrderLocked ? "not-allowed" : "pointer",
          }}
        >
          Limpiar comanda
        </button>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={!canSaveOrder}
        style={{
          marginTop: 16,
          padding: "10px 16px",
          borderRadius: 8,
          background: "#16a34a",
          color: "#fff",
          fontWeight: 600,
          opacity: !canSaveOrder ? 0.5 : 1,
          cursor: !canSaveOrder ? "not-allowed" : "pointer",
        }}
      >
        {isSaving ? "Guardando..." : "Guardar comanda"}
      </button>

      {hasOrderId ? (
        <button
          type="button"
          onClick={onSend}
          disabled={!canSendToKitchen}
          style={{
            marginTop: 8,
            padding: "10px 16px",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            opacity: !canSendToKitchen ? 0.5 : 1,
            cursor: !canSendToKitchen ? "not-allowed" : "pointer",
          }}
        >
          {isSending ? "Enviando..." : "Enviar a cocina"}
        </button>
      ) : null}

      {isSentToKitchen ? (
        <button
          type="button"
          onClick={onReopen}
          disabled={!canReopenOrder}
          style={{
            marginTop: 8,
            padding: "10px 16px",
            borderRadius: 8,
            background: "#f59e0b",
            color: "#111827",
            fontWeight: 700,
            opacity: !canReopenOrder ? 0.5 : 1,
            cursor: !canReopenOrder ? "not-allowed" : "pointer",
          }}
        >
          {isReopening ? "Reabriendo..." : "Reabrir edición"}
        </button>
      ) : null}

      {hasOrderId ? (
        <button
          type="button"
          onClick={onClose}
          disabled={!canCloseOrder}
          style={{
            marginTop: 8,
            padding: "10px 16px",
            borderRadius: 8,
            background: "#dc2626",
            color: "#fff",
            fontWeight: 600,
            opacity: !canCloseOrder ? 0.5 : 1,
            cursor: !canCloseOrder ? "not-allowed" : "pointer",
          }}
        >
          {isClosing ? "Cerrando..." : "Cerrar mesa"}
        </button>
      ) : null}
    </div>
  );
}

