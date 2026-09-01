export const MENU_IMPORT_GENERIC_ERROR =
  "No se pudo analizar la carta. Vuelve a intentarlo o sube una imagen más nítida.";

const MENU_IMPORT_USER_ERRORS: Record<string, string> = {
  ANALYZING_IN_PROGRESS:
    "El borrador ya se está procesando. Espera unos segundos e inténtalo de nuevo.",
  DRAFT_NOT_FOUND: "No encontramos este borrador. Abre otra importación o sube la carta de nuevo.",
  MISSING_SOURCE_URL: "Añade una URL válida del menú y vuelve a intentarlo.",
  MISSING_STORAGE_PATH: "No encontramos el archivo subido. Sube la carta de nuevo.",
  NO_PRODUCTS_DETECTED:
    "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.",
  SETTINGS_MANAGE_REQUIRED: "No tienes permiso para importar cartas en este restaurante.",
  UNAUTHORIZED: "Inicia sesión para procesar la carta.",
};

/**
 * Convierte códigos o mensajes internos del pipeline en texto seguro y útil para el restaurante.
 * Solo se muestran mensajes incluidos expresamente en esta lista.
 */
export function resolveMenuImportUserError(error: unknown): string {
  if (typeof error !== "string") return MENU_IMPORT_GENERIC_ERROR;
  const normalized = error.trim();
  if (!normalized) return MENU_IMPORT_GENERIC_ERROR;

  const byCode = MENU_IMPORT_USER_ERRORS[normalized];
  if (byCode) return byCode;

  const approvedMessage = Object.values(MENU_IMPORT_USER_ERRORS).find(
    (message) => message === normalized,
  );
  return approvedMessage ?? MENU_IMPORT_GENERIC_ERROR;
}
