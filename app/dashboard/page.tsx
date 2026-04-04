"use client";

import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: "40px",
        }}
      >
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 style={{ fontSize: "42px", marginBottom: "10px", marginTop: 0 }}>{t("dashboard.title")}</h1>
          <p style={{ color: "#94a3b8", marginBottom: 0 }}>{t("dashboard.welcome")}</p>
        </div>
        <LanguageSwitcher />
      </div>

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
          <h2>{t("dashboard.moduleStock")}</h2>
          <p style={{ color: "#94a3b8" }}>{t("dashboard.moduleStockDesc")}</p>
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
          <h2>{t("dashboard.moduleMermas")}</h2>
          <p style={{ color: "#94a3b8" }}>{t("dashboard.moduleMermasDesc")}</p>
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
          <h2>{t("dashboard.moduleEscandallos")}</h2>
          <p style={{ color: "#94a3b8" }}>{t("dashboard.moduleEscandallosDesc")}</p>
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
          <h2>{t("dashboard.moduleReportes")}</h2>
          <p style={{ color: "#94a3b8" }}>{t("dashboard.moduleReportesDesc")}</p>
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
          <h2>{t("dashboard.moduleUsuarios")}</h2>
          <p style={{ color: "#94a3b8" }}>{t("dashboard.moduleUsuariosDesc")}</p>
        </div>
      </div>
    </main>
  );
}