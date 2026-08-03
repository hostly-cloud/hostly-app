import { redirect } from "next/navigation";

/** Superficie legacy retirada: cocina canónica vive en Operación → Cocina (KDS). */
export default function LegacyCocinaRedirectPage() {
  redirect("/dashboard/operacion/cocina");
}
