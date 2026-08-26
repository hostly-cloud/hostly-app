import { redirect } from "next/navigation";

/**
 * Compatibilidad de URL: la analítica canónica vive en `/dashboard/analisis`.
 * La antigua superficie de Reportes se retira para no mantener una segunda
 * fuente de métricas basada en localStorage.
 */
export default function ReportesPage() {
  redirect("/dashboard/analisis");
}
