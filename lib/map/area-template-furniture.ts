/**
 * Colocación inicial de elementos al crear plantillas de área (editor de plano).
 * Solo geometría sugerida; sin persistencia propia — el caller usa `createFloorElement`.
 */

import type { PlanElementType } from "@/lib/firestore/tables";

const SNAP = 10;

function snap(n: number): number {
  return Math.round(n / SNAP) * SNAP;
}

export type AreaTemplateFurniturePiece = {
  type: PlanElementType;
  /** Esquina superior izquierda en coordenadas absolutas del plano. */
  x: number;
  y: number;
  name?: string;
  width?: number;
  height?: number;
  seats?: number;
  tableShape?: "square" | "round";
};

export type AreaTemplateKey =
  | "interior"
  | "terraza"
  | "barra"
  | "piscina"
  | "cocktail"
  | "vip";

/** Color de zona muy suave para lectura operativa (hex). */
export function defaultZoneColorForTemplate(key: AreaTemplateKey): string {
  switch (key) {
    case "interior":
      return "#6b6560";
    case "terraza":
      return "#8f8270";
    case "cocktail":
      return "#6d6280";
    case "vip":
      return "#7d6e52";
    case "piscina":
      return "#4a7a92";
    case "barra":
      return "#6e6358";
    default:
      return "#64748b";
  }
}

/**
 * Pocas piezas, composición legible: pasillos implícitos por márgenes y huecos.
 */
export function getAreaTemplateFurniture(
  key: AreaTemplateKey,
  zone: { x: number; y: number; width: number; height: number },
): AreaTemplateFurniturePiece[] {
  const zx = snap(zone.x);
  const zy = snap(zone.y);
  const zw = Math.max(120, snap(zone.width));
  const zh = Math.max(90, snap(zone.height));
  const pad = snap(Math.min(48, Math.min(zw, zh) * 0.12));

  switch (key) {
    case "interior": {
      const barW = snap(Math.max(160, zw - pad * 2));
      const barH = 44;
      const barX = snap(zx + (zw - barW) / 2);
      const barY = snap(zy + pad);
      const rowY = snap(barY + barH + snap(Math.min(zh * 0.12, 56)));
      const tableSize = 60;
      const gap = snap(Math.min(100, (zw - pad * 2 - tableSize * 3) / 2));
      const rowStart = snap(zx + pad + Math.max(0, (zw - pad * 2 - (tableSize * 3 + gap * 2)) / 2));
      const pieces: AreaTemplateFurniturePiece[] = [
        {
          type: "bar",
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          name: "Barra",
        },
      ];
      for (let i = 0; i < 3; i++) {
        const tx = snap(rowStart + i * (tableSize + gap));
        if (tx + tableSize <= zx + zw - pad) {
          pieces.push({
            type: "table",
            x: tx,
            y: rowY,
            width: tableSize,
            height: tableSize,
            seats: 4,
            tableShape: "square",
            name: i === 0 ? "Mesa 1" : undefined,
          });
        }
      }
      return pieces;
    }
    case "terraza": {
      const tw = 62;
      const th = 62;
      const gap = snap(Math.max(70, zw * 0.14));
      const cx = zx + zw / 2;
      const positions: [number, number][] = [
        [snap(zx + pad), snap(zy + pad + 20)],
        [snap(cx - tw / 2), snap(zy + zh * 0.38)],
        [snap(zx + zw - pad - tw), snap(zy + pad + 10)],
        [snap(zx + pad + gap * 0.3), snap(zy + zh - pad - th)],
      ];
      return positions.slice(0, Math.min(4, positions.length)).map(([x, y], i) => ({
        type: "table" as const,
        x,
        y,
        width: tw,
        height: th,
        seats: 4,
        tableShape: "square" as const,
        name: i === 0 ? "Mesa 1" : undefined,
      }));
    }
    case "cocktail": {
      const tw = 50;
      const th = 50;
      const pts: [number, number][] = [
        [zx + zw * 0.12, zy + zh * 0.18],
        [zx + zw * 0.52, zy + zh * 0.28],
        [zx + zw * 0.22, zy + zh * 0.58],
      ];
      return pts.map(([px, py], i) => ({
        type: "table" as const,
        x: snap(px),
        y: snap(py),
        width: tw,
        height: th,
        seats: 2,
        tableShape: "round" as const,
        name: i === 0 ? "Alta 1" : undefined,
      }));
    }
    case "vip": {
      const tw = 92;
      const th = 92;
      const g = 36;
      const x1 = snap(zx + pad);
      const y1 = snap(zy + pad + 10);
      const x2 = snap(x1 + tw + g);
      const y2 = snap(zy + zh * 0.42);
      const list: AreaTemplateFurniturePiece[] = [
        {
          type: "table",
          x: x1,
          y: y1,
          width: tw,
          height: th,
          seats: 6,
          tableShape: "round",
          name: "VIP 1",
        },
      ];
      if (x2 + tw <= zx + zw - pad && y2 + th <= zy + zh - pad) {
        list.push({
          type: "table",
          x: x2,
          y: y2,
          width: tw,
          height: th,
          seats: 6,
          tableShape: "round",
          name: "VIP 2",
        });
      }
      return list;
    }
    case "piscina": {
      const bw = 80;
      const bh = 40;
      const rowY = snap(zy + zh * 0.38);
      const gap = snap(Math.max(90, zw * 0.16));
      const count = Math.min(4, Math.max(2, Math.floor((zw - pad * 2) / (bw + gap * 0.65))));
      const totalW = count * bw + (count - 1) * (gap - bw * 0.35);
      const x0 = snap(zx + (zw - totalW) / 2);
      const pieces: AreaTemplateFurniturePiece[] = [];
      for (let i = 0; i < count; i++) {
        pieces.push({
          type: "sunbed",
          x: snap(x0 + i * (bw + gap * 0.65)),
          y: rowY,
          width: bw,
          height: bh,
          name: i === 0 ? "Hamaca 1" : undefined,
        });
      }
      return pieces;
    }
    case "barra": {
      const barW = snap(Math.max(120, zw - pad * 2));
      const barH = 44;
      const barX = snap(zx + (zw - barW) / 2);
      const barY = snap(zy + (zh - barH) / 2);
      return [
        {
          type: "bar",
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          name: "Barra",
        },
      ];
    }
    default:
      return [];
  }
}
