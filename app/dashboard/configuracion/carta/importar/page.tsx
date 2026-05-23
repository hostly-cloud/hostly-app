import { redirect } from "next/navigation";

/** Alias corto → ruta canónica de importación de carta. */
export default function ConfigCartaImportarAliasRedirect() {
  redirect("/dashboard/configuracion/carta/importacion");
}
