export default function Loading() {
  return (
    <main
      aria-label="Cargando Hostly"
      aria-busy="true"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 50% 18%, rgba(143,199,223,.22), transparent 34%), #f7fbfd",
        color: "#173a55",
      }}
    >
      <section
        style={{
          width: "min(100%, 430px)",
          padding: 28,
          border: "1px solid rgba(23,58,85,.1)",
          borderRadius: 24,
          background: "rgba(255,255,255,.9)",
          boxShadow: "0 24px 60px rgba(15,39,68,.1)",
          backdropFilter: "blur(14px)",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 54,
            height: 54,
            margin: "0 auto 18px",
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            background: "#173a55",
            boxShadow: "0 14px 30px rgba(23,58,85,.2)",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,.35)",
              borderTopColor: "#ffffff",
              animation: "hostly-loading-spin .8s linear infinite",
            }}
          />
        </div>

        <p
          style={{
            margin: "0 0 7px",
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
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.08,
            letterSpacing: "-.03em",
          }}
        >
          Preparando tu espacio de trabajo
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            color: "#5c7385",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Estamos cargando la información necesaria para empezar.
        </p>

        <style>{`
          @keyframes hostly-loading-spin {
            to { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            [aria-label="Cargando Hostly"] span[aria-hidden="true"] {
              animation: none !important;
            }
          }
        `}</style>
      </section>
    </main>
  );
}
