import { kdsSlaThresholds, type KdsStationKind } from "@/lib/kds/kds-sla";

export type OperationalAlertStationPolicy = {
  attentionMinutes: number;
  criticalMinutes: number;
  escalationMinutes: number;
};

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

export function sanitizeOperationalAlertPolicy(value: unknown): OperationalAlertPolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawStations = raw.stations && typeof raw.stations === "object"
    ? raw.stations as Record<string, unknown>
    : {};
  const stations = {} as Record<KdsStationKind, OperationalAlertStationPolicy>;

  for (const station of STATIONS) {
    const defaults = DEFAULT_OPERATIONAL_ALERT_POLICY.stations[station];
    const candidate = rawStations[station] && typeof rawStations[station] === "object"
      ? rawStations[station] as Record<string, unknown>
      : {};
    const attentionMinutes = finiteMinutes(candidate.attentionMinutes, defaults.attentionMinutes, 1, 180);
    const criticalMinutes = finiteMinutes(
      candidate.criticalMinutes,
      defaults.criticalMinutes,
      attentionMinutes + 1,
      240,
    );
    const escalationMinutes = finiteMinutes(candidate.escalationMinutes, defaults.escalationMinutes, 1, 120);
    stations[station] = { attentionMinutes, criticalMinutes, escalationMinutes };
  }

  const rawChannels = raw.notificationChannels && typeof raw.notificationChannels === "object"
    ? raw.notificationChannels as Record<string, unknown>
    : {};

  return {
    enabled: raw.enabled !== false,
    stations,
    notificationChannels: {
      inApp: true,
      push: rawChannels.push === true,
      email: rawChannels.email === true,
      whatsapp: rawChannels.whatsapp === true,
      sms: rawChannels.sms === true,
    },
  };
}

export function resolveOperationalAlertLevel(
  elapsedMs: number,
  station: KdsStationKind,
  policy: OperationalAlertPolicy,
): "normal" | "attention" | "critical" {
  if (!policy.enabled || !Number.isFinite(elapsedMs) || elapsedMs < 0) return "normal";
  const minutes = elapsedMs / 60_000;
  const thresholds = policy.stations[station];
  if (minutes >= thresholds.criticalMinutes) return "critical";
  if (minutes >= thresholds.attentionMinutes) return "attention";
  return "normal";
}

export function isOperationalAlertEscalated(
  elapsedMs: number,
  station: KdsStationKind,
  policy: OperationalAlertPolicy,
): boolean {
  if (!policy.enabled || !Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  const thresholds = policy.stations[station];
  return elapsedMs / 60_000 >= thresholds.criticalMinutes + thresholds.escalationMinutes;
}
