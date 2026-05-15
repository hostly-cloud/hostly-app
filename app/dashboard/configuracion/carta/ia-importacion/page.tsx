import { redirect } from "next/navigation";

/** Ruta histórica; la URL canónica es `/carta/importacion`. */
export default function ConfigCartaIaImportacionLegacyRedirect() {
  redirect("/dashboard/configuracion/carta/importacion");
}
