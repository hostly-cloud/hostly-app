"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom right, #0f172a, #111827, #1e293b)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "700px",
          textAlign: "center",
          backgroundColor: "rgba(255,255,255,0.05)",
          padding: "50px",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          backdropFilter: "blur(10px)",
        }}
      >
        <h1
          style={{
            fontSize: "56px",
            marginBottom: "10px",
            fontWeight: "bold",
            letterSpacing: "-2px",
          }}
        >
          Hostly
        </h1>

        <p
          style={{
            fontSize: "22px",
            color: "#cbd5e1",
            marginBottom: "20px",
          }}
        >
          Gestion inteligente para restaurantes
        </p>

        <p
          style={{
            fontSize: "16px",
            color: "#94a3b8",
            lineHeight: "1.7",
            maxWidth: "520px",
            margin: "0 auto 35px auto",
          }}
        >
          Controla stock, compras, mermas, escandallos y operativa diaria
          desde una sola plataforma sencilla y profesional.
        </p>

        <button
          onClick={() => router.push("/dashboard")}
          style={{
            backgroundColor: "#22c55e",
            color: "white",
            border: "none",
            padding: "16px 32px",
            borderRadius: "14px",
            fontSize: "18px",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(34,197,94,0.35)",
          }}
        >
          Entrar al panel
        </button>
      </div>
    </main>
  );
}