import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { OperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";

export const MAX_RENDERED_TABLE_SEATS = 20;
export const TABLE_SEAT_GAP_PX = 3;

const DEFAULT_TABLE_SIZE: OperationalInstanceCanvasSize = {
  width: 116,
  height: 76,
};

const TABLE_TOP_SIZE_PERCENT: Record<
  OperationalVisualVariant,
  { width: number; height: number }
> = {
  rectangular: { width: 72, height: 52 },
  round: { width: 58, height: 58 },
  square: { width: 52, height: 52 },
};

export type TableSeatPosition = {
  x: number;
  y: number;
  rotationDegrees: number;
};

export type TableTopBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TableSeatSize = {
  width: number;
  height: number;
};

export type TableSeatLayout = {
  tableTop: TableTopBounds;
  seatSize: TableSeatSize;
  seats: TableSeatPosition[];
};

function normalizeSeatCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(MAX_RENDERED_TABLE_SEATS, Math.max(0, Math.round(value)));
}

function distribute(count: number, from: number, to: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(from + to) / 2];
  return Array.from(
    { length: count },
    (_, index) => from + ((to - from) * index) / (count - 1),
  );
}

function normalizeSize(
  size: OperationalInstanceCanvasSize | null | undefined,
): OperationalInstanceCanvasSize {
  return {
    width:
      typeof size?.width === "number" && Number.isFinite(size.width) && size.width > 0
        ? size.width
        : DEFAULT_TABLE_SIZE.width,
    height:
      typeof size?.height === "number" && Number.isFinite(size.height) && size.height > 0
        ? size.height
        : DEFAULT_TABLE_SIZE.height,
  };
}

function resolveVariant(
  visualVariant: OperationalVisualVariant | null | undefined,
): OperationalVisualVariant {
  return visualVariant ?? "rectangular";
}

function seatDimensions(size: OperationalInstanceCanvasSize): {
  width: number;
  height: number;
} {
  return {
    width: Math.min(12, Math.max(5, size.width * 0.09)),
    height: Math.min(15, Math.max(8, size.height * 0.16)),
  };
}

export function getTableTopBounds(
  visualVariant: OperationalVisualVariant | null | undefined,
  inputSize: OperationalInstanceCanvasSize | null | undefined,
): TableTopBounds {
  const size = normalizeSize(inputSize);
  const dimensions = TABLE_TOP_SIZE_PERCENT[resolveVariant(visualVariant)];
  const width = size.width * (dimensions.width / 100);
  const height = size.height * (dimensions.height / 100);
  return {
    x: 0,
    y: 0,
    width,
    height,
  };
}

function normalizeRenderScale(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

function createRoundSeatPositions(
  count: number,
  tableTop: TableTopBounds,
  seat: TableSeatSize,
  gap: number,
): TableSeatPosition[] {
  const centerX = tableTop.width / 2;
  const centerY = tableTop.height / 2;
  const radiusX = tableTop.width / 2;
  const radiusY = tableTop.height / 2;

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const tableRadius =
      1 /
      Math.sqrt(
        (cosine * cosine) / (radiusX * radiusX) +
          (sine * sine) / (radiusY * radiusY),
      );
    const seatCenterRadius = tableRadius + gap + seat.height / 2;
    return {
      x: centerX + cosine * seatCenterRadius,
      y: centerY + sine * seatCenterRadius,
      rotationDegrees: (angle * 180) / Math.PI + 90,
    };
  });
}

function createRectangularSeatPositions(
  count: number,
  tableTop: TableTopBounds,
  seat: TableSeatSize,
  gap: number,
): TableSeatPosition[] {
  const endSeatCount = count >= 8 ? 2 : 0;
  const rowSeatCount = count - endSeatCount;
  const topCount = Math.ceil(rowSeatCount / 2);
  const bottomCount = Math.floor(rowSeatCount / 2);

  return [
    ...distribute(
      topCount,
      seat.width / 2,
      tableTop.width - seat.width / 2,
    ).map((x) => ({
      x,
      y: -gap - seat.height / 2,
      rotationDegrees: 0,
    })),
    ...distribute(
      bottomCount,
      seat.width / 2,
      tableTop.width - seat.width / 2,
    ).map((x) => ({
      x,
      y: tableTop.height + gap + seat.height / 2,
      rotationDegrees: 0,
    })),
    ...(endSeatCount > 0
      ? [
          {
            x: -gap - seat.height / 2,
            y: tableTop.height / 2,
            rotationDegrees: 90,
          },
          {
            x: tableTop.width + gap + seat.height / 2,
            y: tableTop.height / 2,
            rotationDegrees: 90,
          },
        ]
      : []),
  ];
}

function createSquareSeatPositions(
  count: number,
  tableTop: TableTopBounds,
  seat: TableSeatSize,
  gap: number,
): TableSeatPosition[] {
  const sideCounts = [0, 0, 0, 0];
  const balancedSideOrder = [0, 2, 1, 3] as const;
  for (let index = 0; index < count; index += 1) {
    sideCounts[balancedSideOrder[index % balancedSideOrder.length]]! += 1;
  }

  const positions: TableSeatPosition[] = [];
  distribute(
    sideCounts[0]!,
    seat.width / 2,
    tableTop.width - seat.width / 2,
  ).forEach((x) => {
    positions.push({
      x,
      y: -gap - seat.height / 2,
      rotationDegrees: 0,
    });
  });
  distribute(
    sideCounts[1]!,
    seat.width / 2,
    tableTop.height - seat.width / 2,
  ).forEach((y) => {
    positions.push({
      x: tableTop.width + gap + seat.height / 2,
      y,
      rotationDegrees: 90,
    });
  });
  distribute(
    sideCounts[2]!,
    seat.width / 2,
    tableTop.width - seat.width / 2,
  ).forEach((x) => {
    positions.push({
      x,
      y: tableTop.height + gap + seat.height / 2,
      rotationDegrees: 0,
    });
  });
  distribute(
    sideCounts[3]!,
    seat.width / 2,
    tableTop.height - seat.width / 2,
  ).forEach((y) => {
    positions.push({
      x: -gap - seat.height / 2,
      y,
      rotationDegrees: 90,
    });
  });
  return positions;
}

export function createTableSeatLayout(
  seatCount: number | null | undefined,
  visualVariant: OperationalVisualVariant | null | undefined,
  inputSize?: OperationalInstanceCanvasSize | null,
  renderScale?: number | null,
): TableSeatLayout {
  const count = normalizeSeatCount(seatCount);
  const size = normalizeSize(inputSize);
  const variant = resolveVariant(visualVariant);
  const tableTop = getTableTopBounds(variant, size);
  const seatSize = seatDimensions(size);
  const gap = TABLE_SEAT_GAP_PX / normalizeRenderScale(renderScale);
  const seats =
    count === 0
      ? []
      : variant === "round"
        ? createRoundSeatPositions(count, tableTop, seatSize, gap)
        : variant === "square"
          ? createSquareSeatPositions(count, tableTop, seatSize, gap)
          : createRectangularSeatPositions(count, tableTop, seatSize, gap);
  return { tableTop, seatSize, seats };
}
