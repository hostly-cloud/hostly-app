/** Umbral de movimiento antes de iniciar drag (touch slop). */
export const MOUSE_DRAG_SLOP_PX = 8;
export const TOUCH_DRAG_SLOP_PX = 12;

export function getPointerDragSlopPx(pointerType: string): number {
  return pointerType === "touch" ? TOUCH_DRAG_SLOP_PX : MOUSE_DRAG_SLOP_PX;
}

export function hasExceededDragSlop(
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  pointerType: string,
): boolean {
  const dx = clientX - startClientX;
  const dy = clientY - startClientY;
  const slop = getPointerDragSlopPx(pointerType);
  return dx * dx + dy * dy >= slop * slop;
}

export type OperationalInstancePointerPayload = {
  point: { x: number; y: number };
  clientX: number;
  clientY: number;
  pointerType: string;
};
