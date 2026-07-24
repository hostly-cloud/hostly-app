import { redirect } from "next/navigation";

/** Superficie legacy retirada: sala canónica vive en Operación → Sala (KDS). */
export default function LegacySalaRedirectPage() {
  redirect("/dashboard/operacion/sala");
}
