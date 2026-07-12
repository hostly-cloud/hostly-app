const OPERATIONAL_RUNTIME_METADATA_KEYS = new Set([
  "legacyTableId",
  "legacyZoneId",
  "legacyFloorPlanId",
  "currentOrderId",
  "activeOrderId",
  "orderId",
  "orders",
  "reservationId",
  "activeReservationId",
  "paymentId",
  "activePaymentId",
  "currentPaymentId",
  "payment",
  "groupId",
  "tableGroupId",
  "billId",
  "ticketId",
  "checkId",
  "busy",
  "occupiedAt",
  "occupancyStartMs",
  "startedAt",
  "dinersCount",
  "guestCount",
]);

export function isOperationalRuntimeMetadataKey(key: string): boolean {
  return OPERATIONAL_RUNTIME_METADATA_KEYS.has(key);
}

export function cloneMetadataWithoutOperationalRuntimeLinks<T>(
  value: T,
  options?: {
    mapString?: (value: string) => string;
  },
): T {
  if (typeof value === "string") {
    return (options?.mapString ? options.mapString(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneMetadataWithoutOperationalRuntimeLinks(item, options),
    ) as T;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const cloned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isOperationalRuntimeMetadataKey(key)) continue;
    cloned[key] = cloneMetadataWithoutOperationalRuntimeLinks(entry, options);
  }
  return cloned as T;
}
