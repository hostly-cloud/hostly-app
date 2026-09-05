import { kdsSlaThresholds, type KdsStationKind } from "@/lib/kds/kds-sla";

export type OperationalAlertThresholdPolicy = {
  attentionMinutes: number;
  criticalMinutes: number;
  escalationMinutes: number;
};

export type OperationalAlertStationPolicy = OperationalAlertThresholdPolicy;

export type OperationalAlertNotificationChannels = {
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
};

export type OperationalAlertPolicy = {
  enabled: boolean;
  stations: Record<KdsStationKind, OperationalAlertStationPolicy>;
  tableService: OperationalAlertThresholdPolicy;
  notificationChannels: OperationalAlertNotificationChannels;
};

const STATIONS: readonly KdsStationKind[] = ["kitchen", "bar", "cocktail"];

function defaultStationPolicy(station: KdsStationKind, escalationMinutes: number): OperationalAlertStationPolicy {
  const thresholds = kdsSlaThresholds(station);
  return {
    attentionMinutes: thresholds.attention,
    criticalMinutes: thresholds.critical,
    escalationMinutes,
  };
}

export const DEFAULT_OPERATIONAL_ALERT_POLICY: OperationalAlertPolicy = {
  enabled: true,
  stations: {
    kitchen: defaultStationPolicy("kitchen", 5),
    bar: defaultStationPolicy("bar", 3),
    cocktail: defaultStationPolicy("cocktail", 3),
  },
  tableService: {
    attentionMinutes: 20,
    criticalMinutes: 30,
    escalationMinutes: 10,
  },
  notificationChannels: {
    inApp: true,
    push: false,
    email: false,
    whatsapp: false,
    sms: false,
  },
};

function finiteMinutes(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sanitizeThresholdPolicy(
  value: unknown,
  defaults: OperationalAlertThresholdPolicy,
): OperationalAlertThresholdPolicy {
  const candidate = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const attentionMinutes = finiteMinutes(candidate.attentionMinutes, defaults.attentionMinutes, 1, 180);
  const criticalMinutes = finiteMinutes(
    candidate.criticalMinutes,
    defaults.criticalMinutes,
    attentionMinutes + 1,
    240,
  );
  const escalationMinutes = finiteMinutes(candidate.escalationMinutes, defaults.escalationMinutes, 1, 120);
  return { attentionMinutes, criticalMinutes, escalationMinutes };
}

export function sanitizeOperationalAlertPolicy(value: unknown): OperationalAlertPolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawStations = raw.stations && typeof raw.stations === "object"
    ? raw.stations as Record<string, unknown>
    : {};
  const stations = {} as Record<KdsStationKind, OperationalAlertStationPolicy>;

  for (const station of STATIONS) {
    stations[station] = sanitizeThresholdPolicy(
      rawStations[station],
      DEFAULT_OPERATIONAL_ALERT_POLICY.stations[station],
    );
  }

  const rawChannels = raw.notificationChannels && typeof raw.notificationChannels === "object"
    ? raw.notificationChannels as Record<string, unknown>
    : {};

  return {
    enabled: raw.enabled !== false,
    stations,
    tableService: sanitizeThresholdPolicy(
      raw.tableService,
      DEFAULT_OPERATIONAL_ALERT_POLICY.tableService,
    ),
    notificationChannels: {
      inApp: true,
      push: rawChannels.push === true,
      email: rawChannels.email === true,
      whatsapp: rawChannels.whatsapp === true,
      sms: rawChannels.sms === true,
    },
  };
}

function resolveThresholdLevel(
  elapsedMs: number,
  thresholds: OperationalAlertThresholdPolicy,
): "normal" | "attention" | "critical" {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "normal";
  const minutes = elapsedMs / 60_000;
  if (minutes >= thresholds.criticalMinutes) return "critical";
  if (minutes >= thresholds.attentionMinutes) return "attention";
  return "normal";
}

function isThresholdEscalated(
  elapsedMs: number,
  thresholds: OperationalAlertThresholdPolicy,
): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  return elapsedMs / 60_000 >= thresholds.criticalMinutes + thresholds.escalationMinutes;
}

export function resolveOperationalAlertLevel(
  elapsedMs: number,
  station: KdsStationKind,
  policy: OperationalAlertPolicy,
): "normal" | "attention" | "critical" {
  if (!policy.enabled) return "normal";
  return resolveThresholdLevel(elapsedMs, policy.stations[station]);
}

export function isOperationalAlertEscalated(
  elapsedMs: number,
  station: KdsStationKind,
  policy: OperationalAlertPolicy,
): boolean {
  if (!policy.enabled) return false;
  return isThresholdEscalated(elapsedMs, policy.stations[station]);
}

export function resolveTableServiceAlertLevel(
  elapsedMs: number,
  policy: OperationalAlertPolicy,
): "normal" | "attention" | "critical" {
  if (!policy.enabled) return "normal";
  return resolveThresholdLevel(elapsedMs, policy.tableService);
}

export function isTableServiceAlertEscalated(
  elapsedMs: number,
  policy: OperationalAlertPolicy,
): boolean {
  if (!policy.enabled) return false;
  return isThresholdEscalated(elapsedMs, policy.tableService);
}
