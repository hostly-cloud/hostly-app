import { unstable_noStore as noStore } from "next/cache";
import { canAccessInventoryEscandallos, getCurrentRole } from "@/lib/roles";

export default function SensitiveModuleGate({ children }: { children: React.ReactNode }) {
  // Evita que Next cachee el layout con un rol fijo (p. ej. admin en build) y ignore MOCK_USER_ROLE / env.
  noStore();

  const role = getCurrentRole();
  const allowed = canAccessInventoryEscandallos(role);

  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            background: "rgba(0,0,0,0.02)",
            padding: "20px 22px",
            color: "rgba(0,0,0,0.78)",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 650, margin: "0 0 8px" }}>Acceso restringido</h1>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            No tienes permisos para acceder a esta sección.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
