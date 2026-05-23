export const HOSTLY_CONTEXT_HIGHLIGHT_CLASS = "hostly-context-highlight";

export type ScrollAndHighlightOptions = {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  /** Duración del flash antes de quitar la clase (ms). @default 2000 */
  fadeMs?: number;
};

export function scrollAndHighlightElement(
  target: HTMLElement | null,
  options?: ScrollAndHighlightOptions,
): boolean {
  if (!target) return false;

  target.scrollIntoView({
    behavior: options?.behavior ?? "smooth",
    block: options?.block ?? "center",
  });
  target.classList.add(HOSTLY_CONTEXT_HIGHLIGHT_CLASS);

  const fadeMs = options?.fadeMs ?? 2000;
  window.setTimeout(() => {
    target.classList.remove(HOSTLY_CONTEXT_HIGHLIGHT_CLASS);
  }, fadeMs);

  return true;
}

export function scrollAndHighlightElementById(
  elementId: string,
  options?: ScrollAndHighlightOptions,
): boolean {
  const trimmed = elementId.trim();
  if (!trimmed) return false;
  return scrollAndHighlightElement(document.getElementById(trimmed), options);
}

export type ScrollAndHighlightWithRetryOptions = ScrollAndHighlightOptions & {
  /** Reintentos si el nodo aún no está en DOM. @default 10 */
  retries?: number;
  /** Espera entre reintentos (ms). @default 150 */
  retryMs?: number;
  /** Retardo inicial (ms). @default 80 */
  initialDelayMs?: number;
};

/**
 * Scroll + highlight con reintentos (listas async / realtime).
 * Devuelve función de limpieza que cancela reintentos pendientes.
 */
export function scheduleScrollAndHighlightById(
  elementId: string,
  options?: ScrollAndHighlightWithRetryOptions,
): () => void {
  const trimmed = elementId.trim();
  if (!trimmed) return () => {};

  const retries = options?.retries ?? 10;
  const retryMs = options?.retryMs ?? 150;
  const initialDelayMs = options?.initialDelayMs ?? 80;
  let attempts = 0;
  let timer: number | undefined;

  const tick = () => {
    if (scrollAndHighlightElementById(trimmed, options)) return;
    attempts += 1;
    if (attempts < retries) {
      timer = window.setTimeout(tick, retryMs);
    }
  };

  timer = window.setTimeout(tick, initialDelayMs);

  return () => {
    if (timer != null) window.clearTimeout(timer);
  };
}