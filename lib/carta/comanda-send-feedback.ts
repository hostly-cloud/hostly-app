import {
  hasKitchenPassAlreadyReleased,
  hasLinesToReleaseOnComanda,
  isPendingMarchPostresLine,
  isPendingMarchPrimeroLine,
  isPendingMarchSegundosLine,
  type ComandaReleaseLine,
} from "@/lib/carta/comanda-line-release";

function isPendingLine(line: ComandaReleaseLine): boolean {
  return (line.status ?? "").trim().toLowerCase() === "pending";
}

/**
 * Mensaje cuando Comanda no puede enviar nada (o solo bebidas ya fueron las únicas elegibles).
 */
export function resolveComandaNoAutoReleaseFeedback(
  lines: ReadonlyArray<ComandaReleaseLine>,
): string {
  const pending = lines.filter(isPendingLine);
  if (pending.length === 0) {
    return "No hay productos pendientes de enviar.";
  }

  if (hasLinesToReleaseOnComanda(lines)) {
    return "No hay productos pendientes de enviar.";
  }

  if (hasKitchenPassAlreadyReleased(lines)) {
    const pendingSegundos = pending.filter(isPendingMarchSegundosLine);
    if (pendingSegundos.length > 0) {
      return "Hay segundos pendientes. Usa Marchar segundos.";
    }

    const pendingPrimeros = pending.filter(isPendingMarchPrimeroLine);
    if (pendingPrimeros.length > 0) {
      return "Hay primeros pendientes. Usa Marchar primeros.";
    }

    const pendingPostres = pending.filter(isPendingMarchPostresLine);
    if (pendingPostres.length > 0) {
      return "Hay postres pendientes. Usa Marchar postres.";
    }
  }

  return "No hay productos pendientes de enviar.";
}
