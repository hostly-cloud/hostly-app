/**
 * Hit-testing para unir mesas en viewport (sin pasar coords al espacio del mapa).
 * Ignora preview flotante y la tesela origen.
 */

export const HOSTLY_MAP_JOIN_TARGET_SELECTOR = '[data-hostly-map-join-target="1"]';

/** Primer id de mesa válido bajo clientX/clientY, o null. */
export function getJoinTargetFromPoint(
  clientX: number,
  clientY: number,
  sourceTableId: string,
  sourceRootEl: HTMLElement | null,
): string | null {
  if (typeof document === "undefined") return null;
  let stack: Element[];
  try {
    stack = document.elementsFromPoint(clientX, clientY);
  } catch {
    return null;
  }
  const src = String(sourceTableId).trim();
  if (!src) return null;

  for (const node of stack) {
    if (!(node instanceof Element)) continue;

    if (node.closest("[data-hostly-map-join-preview='1']")) {
      continue;
    }

    const host = node.closest(HOSTLY_MAP_JOIN_TARGET_SELECTOR);
    if (!(host instanceof HTMLElement)) continue;

    const tid =
      host.getAttribute("data-hostly-map-table-id")?.trim() ??
      host.getAttribute("data-hostly-map-table")?.trim() ??
      "";
    if (!tid || tid === src) continue;

    if (
      sourceRootEl &&
      (host === sourceRootEl || sourceRootEl.contains(host))
    ) {
      continue;
    }

    return tid;
  }
  return null;
}
