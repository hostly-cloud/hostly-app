"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    console.error("[Hostly][GlobalError]", error);
  }, [error]);

  const retry = () => {
    reset();
  };

  const clearLocalRuntimeAndReload = async () => {
    setCleaning(true);

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("hostly-"))
            .map((cacheName) => caches.delete(cacheName)),
        );
      }
    } catch (cleanupError) {
      console.warn("[Hostly][GlobalError] Runtime cleanup failed", cleanupError);
    } finally {
      window.location.reload();
    }
  };

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f7fbfd",
          color: "#173a55",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main
          style={{
            width: "min(100%, 520px)",
            padding: 28,
            border: "1px solid rgba(23, 58, 85, 0.12)",
            borderRadius: 24,
            background: "#ffffff",
            boxShadow: "0 24px 60px rgba(15, 39, 68, 0.12)",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4d91b8",
            }}
          >
            Hostly
          </p>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>
            No hemos podido iniciar la aplicación
          </h1>
          <p style={{ margin: "14px 0 0", color: "#5c7385", lineHeight: 1.55 }}>
            Reintenta la carga. Si el problema continúa, limpiaremos únicamente la caché local de Hostly y volveremos a abrir la aplicación.
          </p>

          {error.digest ? (
            <p style={{ margin: "14px 0 0", fontSize: 12, color: "#7b8d9a" }}>
              Referencia: {error.digest}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={retry}
              style={{
                minHeight: 44,
                padding: "0 18px",
                border: 0,
                borderRadius: 14,
                background: "#173a55",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => void clearLocalRuntimeAndReload()}
              disabled={cleaning}
              style={{
                minHeight: 44,
                padding: "0 18px",
                border: "1px solid rgba(23, 58, 85, 0.16)",
                borderRadius: 14,
                background: "#ffffff",
                color: "#173a55",
                fontWeight: 700,
                cursor: cleaning ? "wait" : "pointer",
              }}
            >
              {cleaning ? "Limpiando…" : "Limpiar caché y recargar"}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
