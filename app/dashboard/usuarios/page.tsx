import ModulePageShell from "@/components/module-page-shell";

export default function UsuariosPage() {
  return (
    <ModulePageShell
      title="Usuarios"
      subtitle="Gestión de empleados y permisos del equipo."
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
          Módulo en construcción. Aquí podrás invitar usuarios, asignar roles y revisar el acceso al
          panel cuando conectemos la autenticación.
        </p>
      </div>
    </ModulePageShell>
  );
}
