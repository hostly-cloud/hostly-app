import { redirect } from "next/navigation";

const EDITOR_V2_HREF = "/dashboard/configuracion/espacios/editor-v2";

/**
 * Compatibilidad para enlaces historicos.
 *
 * La edicion visual de espacios vive exclusivamente en Editor V2. Esta ruta se
 * conserva para bookmarks/enlaces antiguos, pero no monta ni carga el editor de
 * mapas historico.
 */
export default function LegacyConfigMesasRedirectPage() {
  redirect(EDITOR_V2_HREF);
}
