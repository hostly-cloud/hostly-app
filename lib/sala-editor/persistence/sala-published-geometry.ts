/**
 * Serialización geométrica canónica V2 → readonly (paridad / tests).
 *
 * - Geometría de datos: píxeles lógicos del documento (base.scale.pixelsPerUnit).
 * - Geometría de paint (Editor V2 / TPV readonly): stage display + coordinateScale
 *   (misma regla que `computeEditorVisualLayout` / `getEditorCoordinateScale`).
 */

import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  resolveOperationalVisualVariant,
  type OperationalVisualVariant,
} from "@/lib/sala-editor/ose/operational-visual-variant";
import {
  normalizeSalaEspacioBase,
  type SalaEspacioBase,
} from "@/lib/sala-editor/types/espacio-base";
import {
  computeEditorVisualLayout,
  getEditorCoordinateScale,
  type EditorVisualLayout,
} from "@/lib/sala-editor/canvas/editor-visual-scale";

export type ReadonlyMapGeometryRow = {
  id: string;
  type: string;
  variant: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  layer: string;
};

export function resolveEspacioCanvasSize(espacioBase: {
  dimensions: { width: number; height: number };
  scale: { pixelsPerUnit: number };
}): { width: number; height: number } {
  const base = normalizeSalaEspacioBase(espacioBase);
  return {
    width: Math.max(1, Math.round(base.dimensions.width * base.scale.pixelsPerUnit)),
    height: Math.max(1, Math.round(base.dimensions.height * base.scale.pixelsPerUnit)),
  };
}

export function resolveInstanceLegacyTableId(
  instance: OperationalElementInstance,
): string {
  const meta = instance.metadata ?? {};
  const legacy =
    typeof meta.legacyTableId === "string" ? meta.legacyTableId.trim() : "";
  if (legacy) return legacy;
  return String(instance.id ?? "").trim();
}

export type SalaElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type OperationalInstanceLayout = SalaElementBox & {
  variant: OperationalVisualVariant | null;
};

/** Layout display del espacio (paridad Editor V2; viewport=null → PPU visual por defecto). */
export function resolvePublishedDisplayLayout(
  espacioBase: Pick<SalaEspacioBase, "dimensions" | "scale"> | undefined | null,
): EditorVisualLayout & { coordinateScale: number } {
  const base = normalizeSalaEspacioBase(espacioBase);
  const layout = computeEditorVisualLayout(base, null);
  return {
    ...layout,
    coordinateScale: getEditorCoordinateScale(layout),
  };
}

/** Escala un rect lógico al stage display (superficies, zonas, estructurales, landscape). */
export function scaleLogicalElementBox(
  box: SalaElementBox,
  coordinateScale: number,
): SalaElementBox {
  if (coordinateScale === 1) return { ...box };
  return {
    x: box.x * coordinateScale,
    y: box.y * coordinateScale,
    width: box.width * coordinateScale,
    height: box.height * coordinateScale,
    rotation: box.rotation,
  };
}

/**
 * Caja operativa en espacio de paint Editor V2:
 * - posición lógica × coordinateScale
 * - width/height fijos (no × PPU; mismas primitives que el editor)
 */
export function resolveOperationalInstanceDisplayLayout(
  instance: OperationalElementInstance,
  coordinateScale: number,
): OperationalInstanceLayout {
  const size = getOperationalInstanceCanvasSize(instance);
  const cx = instance.position.x * coordinateScale;
  const cy = instance.position.y * coordinateScale;
  return {
    x: cx - size.width / 2,
    y: cy - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: instance.rotation ?? 0,
    variant: resolveOperationalVisualVariant(
      instance.metadata,
      instance.elementType,
    ),
  };
}

/** Geometría lógica (datos / publish sync). No aplicar pixelsPerUnit otra vez. */
export function instanceTopLeftLayout(
  instance: OperationalElementInstance,
): OperationalInstanceLayout {
  return resolveOperationalInstanceDisplayLayout(instance, 1);
}

export type ReadonlyMapGeometryDiagRow = {
  id: string;
  kind: string;
  variant: string | null;
  published: SalaElementBox;
  resolved: SalaElementBox;
  rendered: SalaElementBox;
  planDimensions: { width: number; height: number };
  pixelsPerUnit: number;
  appliedScale: number;
};

export function buildReadonlyMapGeometryDiag(params: {
  document: SalaEditorDocument;
  espacioId: string;
}): ReadonlyMapGeometryDiagRow[] {
  const espacio = params.document.espacios.find(
    (e) => e.id === params.espacioId,
  );
  if (!espacio) return [];
  const base = normalizeSalaEspacioBase(espacio.base);
  const display = resolvePublishedDisplayLayout(base);
  const rows: ReadonlyMapGeometryDiagRow[] = [];
  const spaceId = espacio.id;

  const push = (
    id: string,
    kind: string,
    variant: string | null,
    published: SalaElementBox,
    resolved: SalaElementBox,
  ) => {
    rows.push({
      id,
      kind,
      variant,
      published,
      resolved,
      rendered: { ...resolved },
      planDimensions: { ...base.dimensions },
      pixelsPerUnit: base.scale.pixelsPerUnit,
      appliedScale: display.coordinateScale,
    });
  };

  for (const s of params.document.surfaceObjects ?? []) {
    if (s.espacioId !== spaceId || s.visible === false) continue;
    const published = {
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      rotation: 0,
    };
    push(
      s.id,
      `surface:${s.material}`,
      null,
      published,
      scaleLogicalElementBox(published, display.coordinateScale),
    );
  }
  for (const z of params.document.zones ?? []) {
    if (z.espacioId !== spaceId || z.visible === false) continue;
    const published = {
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      rotation: 0,
    };
    push(
      z.id,
      `zone:${z.type}`,
      null,
      published,
      scaleLogicalElementBox(published, display.coordinateScale),
    );
  }
  for (const w of params.document.walls ?? []) {
    if (w.espacioId !== spaceId) continue;
    const published = {
      x: Math.min(w.x1, w.x2),
      y: Math.min(w.y1, w.y2),
      width: Math.max(1, Math.abs(w.x2 - w.x1)),
      height: Math.max(1, Math.abs(w.y2 - w.y1)),
      rotation: 0,
    };
    push(
      w.id,
      "wall",
      null,
      published,
      scaleLogicalElementBox(published, display.coordinateScale),
    );
  }
  for (const el of params.document.structuralElements ?? []) {
    if (el.espacioId !== spaceId) continue;
    const published = {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation ?? 0,
    };
    push(
      el.id,
      `structural:${el.kind}`,
      null,
      published,
      scaleLogicalElementBox(published, display.coordinateScale),
    );
  }
  for (const el of params.document.landscapeElements ?? []) {
    if (el.espacioId !== spaceId || el.visible === false) continue;
    const published = {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: 0,
    };
    push(
      el.id,
      `landscape:${el.kind}`,
      null,
      published,
      scaleLogicalElementBox(published, display.coordinateScale),
    );
  }
  for (const instance of params.document.operationalElementInstances ?? []) {
    if (instance.spaceId !== spaceId || instance.visible === false) continue;
    const published = instanceTopLeftLayout(instance);
    const resolved = resolveOperationalInstanceDisplayLayout(
      instance,
      display.coordinateScale,
    );
    push(
      instance.id,
      instance.elementType,
      published.variant,
      {
        x: published.x,
        y: published.y,
        width: published.width,
        height: published.height,
        rotation: published.rotation,
      },
      {
        x: resolved.x,
        y: resolved.y,
        width: resolved.width,
        height: resolved.height,
        rotation: resolved.rotation,
      },
    );
  }
  return rows;
}

export function logReadonlyMapGeometryDiag(
  rows: ReadonlyMapGeometryDiagRow[],
): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  for (const row of rows) {
    console.log("[Hostly:ReadonlyMapGeometryDiag]", row);
  }
}

/** Snapshot display (paridad Editor V2 paint) para tests. */
export function serializeReadonlyDisplayGeometry(
  document: SalaEditorDocument,
  espacioId?: string,
): ReadonlyMapGeometryRow[] {
  const spaceFilter = espacioId?.trim() || null;
  const espacio = spaceFilter
    ? document.espacios.find((e) => e.id === spaceFilter)
    : document.espacios[0];
  const scale = espacio
    ? resolvePublishedDisplayLayout(espacio.base).coordinateScale
    : 1;
  const logical = serializePublishedGeometry(document, espacioId);
  return logical.map((row) => {
    if (row.layer === "operational") {
      const instance = (document.operationalElementInstances ?? []).find(
        (i) => i.id === row.id,
      );
      if (!instance) return row;
      const display = resolveOperationalInstanceDisplayLayout(instance, scale);
      return {
        ...row,
        x: display.x,
        y: display.y,
        width: display.width,
        height: display.height,
        rotation: display.rotation,
        variant: display.variant,
      };
    }
    const scaled = scaleLogicalElementBox(
      {
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        rotation: row.rotation,
      },
      scale,
    );
    return { ...row, ...scaled };
  });
}

/** Snapshot estable de geometría publicada para tests de paridad. */
export function serializePublishedGeometry(
  document: SalaEditorDocument,
  espacioId?: string,
): ReadonlyMapGeometryRow[] {
  const rows: ReadonlyMapGeometryRow[] = [];
  const spaceFilter = espacioId?.trim() || null;

  for (const surface of document.surfaceObjects ?? []) {
    if (spaceFilter && surface.espacioId !== spaceFilter) continue;
    rows.push({
      id: surface.id,
      type: `surface:${surface.material}`,
      variant: null,
      x: surface.x,
      y: surface.y,
      width: surface.width,
      height: surface.height,
      rotation: 0,
      zIndex: 1,
      layer: "surface",
    });
  }

  for (const zone of document.zones ?? []) {
    if (spaceFilter && zone.espacioId !== spaceFilter) continue;
    rows.push({
      id: zone.id,
      type: `zone:${zone.type}`,
      variant: null,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      rotation: 0,
      zIndex: 2,
      layer: "zone",
    });
  }

  for (const wall of document.walls ?? []) {
    if (spaceFilter && wall.espacioId !== spaceFilter) continue;
    const minX = Math.min(wall.x1, wall.x2);
    const minY = Math.min(wall.y1, wall.y2);
    const width = Math.max(1, Math.abs(wall.x2 - wall.x1));
    const height = Math.max(1, Math.abs(wall.y2 - wall.y1));
    rows.push({
      id: wall.id,
      type: "wall",
      variant: null,
      x: minX,
      y: minY,
      width,
      height,
      rotation: 0,
      zIndex: 3,
      layer: "wall",
    });
  }

  for (const el of document.structuralElements ?? []) {
    if (spaceFilter && el.espacioId !== spaceFilter) continue;
    rows.push({
      id: el.id,
      type: `structural:${el.kind}`,
      variant: null,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation ?? 0,
      zIndex: 4,
      layer: "structural",
    });
  }

  for (const el of document.landscapeElements ?? []) {
    if (spaceFilter && el.espacioId !== spaceFilter) continue;
    rows.push({
      id: el.id,
      type: `landscape:${el.kind}`,
      variant: null,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: 0,
      zIndex: 5,
      layer: "landscape",
    });
  }

  for (const instance of document.operationalElementInstances ?? []) {
    if (spaceFilter && instance.spaceId !== spaceFilter) continue;
    if (instance.visible === false) continue;
    const layout = instanceTopLeftLayout(instance);
    rows.push({
      id: instance.id,
      type: instance.elementType,
      variant: layout.variant,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      rotation: layout.rotation,
      zIndex: 10,
      layer: "operational",
    });
  }

  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
