import ModulePageShell from "@/components/module-page-shell";

export default function ReportesPage() {
  return (
    <ModulePageShell
      title="Reportes"
      subtitle="Análisis del negocio y métricas operativas."
    >
      <div
        style={{
          backgroundColor: "#1e293b",
          borderRadius: 16,
          padding: "24px 28px",
          maxWidth: 560,
          border: "1px solid #334155",
        }}
      >
        <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>
          Módulo en construcción. Aquí podrás consultar resúmenes de compras, mermas, costes y
          rendimiento cuando conectemos los datos y los gráficos.
        </p>
      </div>
    </ModulePageShell>
  );
}
