"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { MesaHeader } from "@/components/mesas/MesaHeader";
import { MesaOrderPanel } from "@/components/mesas/MesaOrderPanel";
import { MesaOrderHistory } from "@/components/mesas/MesaOrderHistory";
import { MesaProductGrid } from "@/components/mesas/MesaProductGrid";
import { useMesaComanda } from "@/hooks/useMesaComanda";

export default function MesaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { restaurantId } = useAuth();

  const raw = params?.mesaId;
  const mesaId = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");

  const mesaComanda = useMesaComanda(mesaId, restaurantId);

  if (mesaComanda.loading) {
    return (
      <div
        style={{
          padding: 24,
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        Cargando mesa...
      </div>
    );
  }

  if (!mesaComanda.mesa) {
    return (
      <div
        style={{
          padding: 24,
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        Mesa no encontrada
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          marginBottom: 16,
          fontSize: 14,
          opacity: 0.7,
        }}
      >
        ← Volver
      </button>

      <MesaHeader
        mesa={mesaComanda.mesa}
        totalItemsCount={mesaComanda.totalItemsCount}
        orderTotal={mesaComanda.orderTotal}
        orderStatusLabel={mesaComanda.orderStatusLabel}
        orderStatusColor={mesaComanda.orderStatusColor}
        orderStatus={mesaComanda.orderStatus}
        busyLabel={mesaComanda.busyLabel}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: mesaComanda.isNarrowScreen
            ? "1fr"
            : "minmax(0, 1.4fr) minmax(320px, 0.8fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <MesaProductGrid
          productSearch={mesaComanda.productSearch}
          onProductSearchChange={mesaComanda.setProductSearch}
          categories={mesaComanda.categories}
          selectedCategory={mesaComanda.selectedCategory}
          onSelectedCategoryChange={mesaComanda.setSelectedCategory}
          getCategoryCount={mesaComanda.getCategoryCount}
          sortedProducts={mesaComanda.sortedProducts}
          items={mesaComanda.items}
          isOrderLocked={mesaComanda.isOrderLocked}
          onAddItem={mesaComanda.addItem}
        />

        <div
          style={{
            position: mesaComanda.isNarrowScreen ? "static" : "sticky",
            top: 16,
          }}
        >
          <MesaOrderPanel
            items={mesaComanda.items}
            orderTotal={mesaComanda.orderTotal}
            isOrderLocked={mesaComanda.isOrderLocked}
            onAdd={(id) => mesaComanda.updateItemQty(id, 1)}
            onRemove={(id) => mesaComanda.updateItemQty(id, -1)}
            onClear={mesaComanda.handleClearItems}
            canSaveOrder={mesaComanda.canSaveOrder}
            canSendToKitchen={mesaComanda.canSendToKitchen}
            canCloseOrder={mesaComanda.canCloseOrder}
            canReopenOrder={mesaComanda.canReopenOrder}
            isSaving={mesaComanda.isSaving}
            isSending={mesaComanda.isSending}
            isClosing={mesaComanda.isClosing}
            isReopening={mesaComanda.isReopening}
            onSave={() => void mesaComanda.handleSaveOrder()}
            onSend={() => void mesaComanda.handleSendToKitchen()}
            onClose={() => void mesaComanda.handleCloseOrder()}
            onReopen={() => void mesaComanda.handleReopenOrder()}
            actionHint={mesaComanda.actionHint}
            hasOrderId={Boolean(mesaComanda.currentOrderId)}
            isSentToKitchen={mesaComanda.isSentToKitchen}
          />

          <MesaOrderHistory
            pastOrders={mesaComanda.pastOrders}
            isSentToKitchen={mesaComanda.isSentToKitchen}
            formatOrderDate={mesaComanda.formatOrderDate}
            getOrderItemsCount={mesaComanda.getOrderItemsCount}
            onRepeatOrder={mesaComanda.handleRepeatOrder}
          />
        </div>
      </div>

      {!mesaComanda.isNarrowScreen && (
        <button
          type="button"
          onClick={mesaComanda.handleScrollTop}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            padding: "10px 14px",
            borderRadius: 999,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}
