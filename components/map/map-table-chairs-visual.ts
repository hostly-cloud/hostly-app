import type { Table } from "@/lib/firestore/tables";

/** Tope de cápsulas por mesa (solo dibujo). */
export const MAP_TABLE_CHAIRS_MAX = 16;

/** Tokens visuales — sillas discretas, sin lógica de negocio. */
export const MAP_TABLE_CHAIR_FILL =
  "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(248,250,252,0.2) 100%)";
export const MAP_TABLE_CHAIR_BORDER = "1px solid rgba(148, 163, 184, 0.12)";
export const MAP_TABLE_CHAIR_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.05)";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Asientos a dibujar: `seats`, si no `capacity`, si no 4. Solo para `type === "table"`.
 */
export function mapTableSeatCount(table: Table): number {
  if (table.type !== "table") return 0;
  const cap = (table as { capacity?: unknown }).capacity;
  const fromSeats =
    typeof table.seats === "number" && Number.isFinite(table.seats)
      ? table.seats
      : null;
  const fromCap =
    typeof cap === "number" && Number.isFinite(cap) ? cap : null;
  const raw =
    fromSeats != null ? fromSeats : fromCap != null ? fromCap : 4;
  return clamp(Math.floor(raw), 0, MAP_TABLE_CHAIRS_MAX);
}

export type MapTableChairLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};

export function mapTableChairLayouts(
  w: number,
  h: number,
  tableShape: Table["tableShape"] | undefined,
  n: number,
): MapTableChairLayout[] {
  if (n <= 0 || w < 10 || h < 10) return [];

  const pad = Math.max(2, Math.min(w, h) * 0.055);
  const cw = clamp(Math.min(w, h) * 0.095, 3.5, 9);
  const ch = clamp(cw * 1.15, 4, 10);
  const isRound = tableShape === "round";
  const ratio = w / Math.max(h, 1e-6);
  const squareish = !isRound && ratio >= 0.85 && ratio <= 1.18;

  if (isRound) {
    const cx = w / 2;
    const cy = h / 2;
    const rr = Math.min(w, h) / 2 - pad - Math.hypot(cw, ch) / 2;
    const rUse = Math.max(rr, Math.min(w, h) * 0.16);
    const layouts: MapTableChairLayout[] = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      const rot = (a * 180) / Math.PI + 90;
      layouts.push({
        left: clamp(cx + rUse * Math.cos(a) - cw / 2, 0, w - cw),
        top: clamp(cy + rUse * Math.sin(a) - ch / 2, 0, h - ch),
        width: cw,
        height: ch,
        rotation: rot,
      });
    }
    return layouts;
  }

  let nTop = 0;
  let nRight = 0;
  let nBottom = 0;
  let nLeft = 0;

  if (squareish) {
    const q = Math.floor(n / 4);
    let rem = n - q * 4;
    nTop = q + (rem > 0 ? 1 : 0);
    rem = Math.max(0, rem - 1);
    nRight = q + (rem > 0 ? 1 : 0);
    rem = Math.max(0, rem - 1);
    nBottom = q + (rem > 0 ? 1 : 0);
    rem = Math.max(0, rem - 1);
    nLeft = n - nTop - nRight - nBottom;
    void rem;
  } else if (w >= h) {
    const nTB = clamp(
      Math.round((n * (2 * w)) / (2 * w + 2 * h)),
      n >= 2 ? 1 : 0,
      Math.max(0, n - 1),
    );
    nTop = Math.floor(nTB / 2);
    nBottom = nTB - nTop;
    const rest = n - nTB;
    nLeft = Math.floor(rest / 2);
    nRight = rest - nLeft;
  } else {
    const nLR = clamp(
      Math.round((n * (2 * h)) / (2 * w + 2 * h)),
      n >= 2 ? 1 : 0,
      Math.max(0, n - 1),
    );
    nLeft = Math.floor(nLR / 2);
    nRight = nLR - nLeft;
    const rest = n - nLR;
    nTop = Math.floor(rest / 2);
    nBottom = rest - nTop;
  }

  const horizW = Math.min(cw * 1.35, Math.max(4, (w - 2 * pad) * 0.44));
  const horizH = Math.max(3.2, ch * 0.78);
  const vertW = horizH;
  const vertH = horizW;

  const layouts: MapTableChairLayout[] = [];

  const alongTop = (count: number) => {
    if (count <= 0) return;
    const ww = Math.min(horizW, w - 2 * pad - 2);
    const span = Math.max(0, w - 2 * pad - ww);
    for (let i = 0; i < count; i++) {
      const x =
        count === 1
          ? (w - ww) / 2
          : pad + (i * span) / Math.max(1, count - 1);
      layouts.push({
        left: clamp(x, pad, w - ww - pad),
        top: pad,
        width: ww,
        height: horizH,
        rotation: 0,
      });
    }
  };
  const alongBottom = (count: number) => {
    if (count <= 0) return;
    const ww = Math.min(horizW, w - 2 * pad - 2);
    const span = Math.max(0, w - 2 * pad - ww);
    for (let i = 0; i < count; i++) {
      const x =
        count === 1
          ? (w - ww) / 2
          : pad + (i * span) / Math.max(1, count - 1);
      layouts.push({
        left: clamp(x, pad, w - ww - pad),
        top: h - horizH - pad,
        width: ww,
        height: horizH,
        rotation: 0,
      });
    }
  };
  const alongRight = (count: number) => {
    if (count <= 0) return;
    const hh = Math.min(vertH, h - 2 * pad - 2);
    const span = Math.max(0, h - 2 * pad - hh);
    for (let i = 0; i < count; i++) {
      const y =
        count === 1
          ? (h - hh) / 2
          : pad + (i * span) / Math.max(1, count - 1);
      layouts.push({
        left: w - vertW - pad,
        top: clamp(y, pad, h - hh - pad),
        width: vertW,
        height: hh,
        rotation: 0,
      });
    }
  };
  const alongLeft = (count: number) => {
    if (count <= 0) return;
    const hh = Math.min(vertH, h - 2 * pad - 2);
    const span = Math.max(0, h - 2 * pad - hh);
    for (let i = 0; i < count; i++) {
      const y =
        count === 1
          ? (h - hh) / 2
          : pad + (i * span) / Math.max(1, count - 1);
      layouts.push({
        left: pad,
        top: clamp(y, pad, h - hh - pad),
        width: vertW,
        height: hh,
        rotation: 0,
      });
    }
  };

  alongTop(nTop);
  alongRight(nRight);
  alongBottom(nBottom);
  alongLeft(nLeft);

  return layouts;
}
