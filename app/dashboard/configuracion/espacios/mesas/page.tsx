import { redirect } from "next/navigation";

const EDITOR_V2_HREF = "/dashboard/configuracion/espacios/editor-v2";

export default function ConfigEspaciosMesasPage() {
  redirect(EDITOR_V2_HREF);
}
