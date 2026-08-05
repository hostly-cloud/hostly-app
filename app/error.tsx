"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Hostly][RouteError]", error);
  }, [error]);

  return (
    <main
      aria-labelledby="hostly-route-error-title"
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f7fbfd",
        color: "#173a55",
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          padding: 28,
          border: "1px solid rgba(23,58,85,.12)",
          borderRadius: 24,
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15,39,68,.1)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            color: "#4d91b8",
            fontSize: 12,
            fontWeight: 780,
            letterSpacing: ".09em",
            textTransform: "uppercase",
          }}
        >
          Hostly
        </p>
        <h1
          id="hostly-route-error-title"
          style={{ margin: 0, fontSize: 30, lineHeight: 1.08, letterSpacing: "-.03em" }}
        >
          Esta sección no ha podido cargarse
        </h1>
        <p style={{ margin: "14px 0 0", color: "#5c7385", lineHeight: 1.55 }}>
          El resto de Hostly sigue disponible. Puedes reintentar esta pantalla o volver al centro de operaciones.
        </p>

        {error.digest ? (
          <p style={{ margin: "14px 0 0", fontSize: 12, color: "#7b8d9a" }}>
            Referencia: {error.digest}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reset}
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
          <a
            href="/dashboard"
            style={{
              minHeight: 44,
              padding: "0 18px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(23,58,85,.16)",
              borderRadius: 14,
              background: "#ffffff",
              color: "#173a55",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Volver al Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
