"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import ModulePageShell from "@/components/module-page-shell";
import { migrateLegacyPurchasesFromBrowser } from "@/lib/purchases/legacy-purchase-migration";

const CANONICAL_PURCHASES_ROUTE = "/dashboard/inventario/pedidos-compra";

export default function ComprasPage() {
  const router = useRouter();
  const { restaurantId, ready, profileReady } = useAuth();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profileReady || startedRef.current) return;
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setError("No se ha podido resolver el restaurante activo.");
      return;
    }
    startedRef.current = true;
    void migrateLegacyPurchasesFromBrowser(rid)
      .then(() => router.replace(CANONICAL_PURCHASES_ROUTE))
      .catch((migrationError) => {
        console.error("[compras] legacy migration failed", migrationError);
        setError(
          "No se han podido migrar las compras antiguas. Los datos locales se conservan y no se ha eliminado nada.",
        );
        startedRef.current = false;
      });
  }, [profileReady, ready, restaurantId, router]);

  return (
    <ModulePageShell
      title="Compras"
      description="Actualizando Compras al flujo canónico de pedidos y recepciones."
    >
      <div
        style={{
          maxWidth: 720,
          border: "1px solid var(--hostly-line)",
          borderRadius: 14,
          padding: 18,
          background: "var(--hostly-surface-card-solid)",
        }}
      >
        {error ? (
          <>
            <p style={{ margin: 0, color: "var(--hostly-danger, #b42318)" }}>{error}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  startedRef.current = false;
                  router.refresh();
                }}
                className="hostly-button hostly-button--primary"
              >
                Reintentar migración
              </button>
              <Link href={CANONICAL_PURCHASES_ROUTE} className="hostly-button">
                Ir a Pedidos de compra
              </Link>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--hostly-ink-muted)" }}>
            Migrando cualquier compra antigua de este dispositivo y abriendo Pedidos de compra…
          </p>
        )}
      </div>
    </ModulePageShell>
  );
}
