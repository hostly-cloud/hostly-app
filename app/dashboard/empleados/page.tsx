import Link from "next/link";
import EmpleadosPageContent from "./employees-page-content";

export default function EmpleadosPage() {
  return (
    <div className="relative">
      <div className="mx-auto flex max-w-[1180px] justify-end px-4 pt-3 sm:px-6">
        <Link
          href="/dashboard/empleados/operaciones"
          className="hostly-button-primary hostly-button-compact"
        >
          Abrir RRHH operativo
        </Link>
      </div>
      <EmpleadosPageContent />
    </div>
  );
}
