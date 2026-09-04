"use client";

import ProductosManagementPage from "@/components/productos/productos-management-page";
import styles from "./productos-experience.module.css";

export default function ConfigCartaProductosPage() {
  return (
    <div className={`${styles.root} flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <ProductosManagementPage
        lockViewportFillParent
        embedConfigVisual
        dashboardListIceVisual
      />
    </div>
  );
}
