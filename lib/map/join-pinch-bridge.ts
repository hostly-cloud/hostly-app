/**
 * Coordinación join-mesas ↔ PinchZoomMap en táctil.
 * Evita que el pan/pinch robe el gesto antes del "arm" del arrastre de unión.
 */

export const HOSTLY_MAP_JOIN_ARMED = "hostly-map-join-armed";
export const HOSTLY_MAP_JOIN_ABORTED = "hostly-map-join-aborted";

export type HostlyMapJoinArmedDetail = { pointerId: number };
export type HostlyMapJoinAbortedDetail = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

/** Mesas donde está habilitado arrastrar para unir (atributo en DOM). */
export const HOSTLY_MAP_JOIN_SELECTOR = '[data-hostly-map-join="1"]';
