"use client";

import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        color: "white",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "42px", marginBottom: "10px" }}>
        Dashboard Hostly
      </h1>

      <p style={{ color: "#94a3b8", marginBottom: "40px" }}>
        Bienvenido al panel principal de gestión
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
        }}
      >
        <div
          onClick={() => router.push("/dashboard/stock")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Stock</h2>
          <p style={{ color: "#94a3b8" }}>Control de inventario</p>
        </div>

        <div
          onClick={() => router.push("/dashboard/compras")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Compras</h2>
          <p style={{ color: "#94a3b8" }}>Pedidos y proveedores</p>
        </div>

        <div
          onClick={() => router.push("/dashboard/mermas")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Mermas</h2>
          <p style={{ color: "#94a3b8" }}>Control de pérdidas</p>
        </div>

        <div
          onClick={() => router.push("/dashboard/escandallos")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Escandallos</h2>
          <p style={{ color: "#94a3b8" }}>Costes de platos</p>
        </div>

        <div
          onClick={() => router.push("/dashboard/reportes")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Reportes</h2>
          <p style={{ color: "#94a3b8" }}>Análisis del negocio</p>
        </div>

        <div
          onClick={() => router.push("/dashboard/usuarios")}
          style={{
            backgroundColor: "#1e293b",
            padding: "24px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          <h2>Usuarios</h2>
          <p style={{ color: "#94a3b8" }}>Gestión de empleados</p>
        </div>
      </div>
    </main>
  );
}