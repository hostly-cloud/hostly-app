"use client";

import ProductosManagementPage from "@/components/productos/productos-management-page";

export default function ConfigCartaProductosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProductosManagementPage lockViewportFillParent embedConfigVisual />
    </div>
  );
}
