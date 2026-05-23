export type KdsVisualBatchLine = {
  key: string;
  displayLabel: string;
  totalQty: number;
  course: number;
  lines: Array<{
    orderId: string;
    itemId: string;
    qty: number;
    name: string;
  }>;
};

type BatchableLine = {
  orderId: string;
  itemId: string;
  name: string;
  qty: number;
  course: number;
  modifiersSubtitle?: string;
  note?: string;
  sentAtMs?: number;
};

function batchKey(line: BatchableLine): string {
  const sentBucket =
    line.sentAtMs != null
      ? Math.floor(line.sentAtMs / 2000)
      : "na";
  return [
    line.name.trim().toLowerCase(),
    String(line.course),
    line.modifiersSubtitle?.trim() ?? "",
    line.note?.trim() ?? "",
    String(sentBucket),
  ].join("|");
}

/** Agrupación visual: no altera ids ni estados Firestore. */
export function buildKdsVisualBatchLines(
  lines: readonly BatchableLine[],
): KdsVisualBatchLine[] {
  const map = new Map<string, KdsVisualBatchLine>();
  for (const line of lines) {
    const key = batchKey(line);
    const existing = map.get(key);
    if (existing) {
      existing.totalQty += line.qty;
      existing.displayLabel = `${existing.totalQty}x ${line.name}`;
      existing.lines.push({
        orderId: line.orderId,
        itemId: line.itemId,
        qty: line.qty,
        name: line.name,
      });
      continue;
    }
    map.set(key, {
      key,
      displayLabel: `${line.qty}x ${line.name}`,
      totalQty: line.qty,
      course: line.course,
      lines: [
        {
          orderId: line.orderId,
          itemId: line.itemId,
          qty: line.qty,
          name: line.name,
        },
      ],
    });
  }
  return Array.from(map.values());
}

export function isKdsBatchFullyPrepared(
  lines: readonly { status?: string }[],
): boolean {
  return lines.length > 0 && lines.every((line) => line.status === "prepared");
}

export function isKdsBatchFullyServed(
  lines: readonly { status?: string }[],
): boolean {
  return lines.length > 0 && lines.every((line) => line.status === "served");
}
