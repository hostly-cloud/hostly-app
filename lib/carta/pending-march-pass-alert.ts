import { resolveComandaLineCourseNum } from "@/lib/carta/comanda-line-course";
import {
  isPendingMarchPostresLine,
  isPendingMarchPrimeroLine,
  isPendingMarchSegundosLine,
  resolveComandaLineKdsDestination,
  type ComandaReleaseLine,
} from "@/lib/carta/comanda-line-release";
import { getMenuCourseSectionLabel } from "@/lib/carta/menu-course";

export type PendingMarchPassAction = "primeros" | "segundos" | "postres";

export type PendingMarchPassAlert = {
  course: 2 | 3 | 4;
  label: string;
  count: number;
  action: PendingMarchPassAction;
};

function normalizeLineStatus(status: string | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function isActiveLine(line: ComandaReleaseLine): boolean {
  return normalizeLineStatus(line.status) !== "cancelled";
}

function isKitchenLine(line: ComandaReleaseLine): boolean {
  return resolveComandaLineKdsDestination(line) === "kitchen";
}

function lineCourseNum(line: ComandaReleaseLine): number {
  return resolveComandaLineCourseNum(line);
}

/** Línea ya liberada a cocina (Comanda/Marchar) o en curso; no exige served. */
const RELEASED_KITCHEN_LINE_STATUSES = new Set([
  "sent",
  "preparing",
  "prepared",
  "ready",
  "served",
]);

function isLinePendingOnly(line: ComandaReleaseLine): boolean {
  return normalizeLineStatus(line.status) === "pending";
}

function isLineReleasedToKitchen(line: ComandaReleaseLine): boolean {
  return RELEASED_KITCHEN_LINE_STATUSES.has(normalizeLineStatus(line.status));
}

/**
 * Cada pase de cocina anterior al objetivo con líneas activas debe haberse
 * marchado al menos una vez: no puede estar todo en pending y debe existir
 * al menos una línea sent / preparing / prepared / served.
 * Pases sin líneas activas cuentan como OK.
 */
export function areEarlierKitchenPassesReleasedForMarch(
  lines: ReadonlyArray<ComandaReleaseLine>,
  targetCourse: number,
): boolean {
  for (let course = 1; course < targetCourse; course++) {
    const courseLines = lines.filter(
      (line) =>
        isActiveLine(line) &&
        isKitchenLine(line) &&
        lineCourseNum(line) === course,
    );
    if (courseLines.length === 0) continue;

    const allStillPending = courseLines.every((line) => isLinePendingOnly(line));
    if (allStillPending) return false;

    const hasReleasedLine = courseLines.some((line) =>
      isLineReleasedToKitchen(line),
    );
    if (!hasReleasedLine) return false;
  }

  return true;
}

/** @deprecated Alias histórico; usar `areEarlierKitchenPassesReleasedForMarch`. */
export function areEarlierKitchenPassesServed(
  lines: ReadonlyArray<ComandaReleaseLine>,
  targetCourse: number,
): boolean {
  return areEarlierKitchenPassesReleasedForMarch(lines, targetCourse);
}

function pendingMarchLinesForCourse(
  lines: ReadonlyArray<ComandaReleaseLine>,
  course: 2 | 3 | 4,
): ComandaReleaseLine[] {
  return lines.filter((line) => {
    if (!isActiveLine(line) || !isKitchenLine(line)) return false;
    if (course === 2) return isPendingMarchPrimeroLine(line);
    if (course === 3) return isPendingMarchSegundosLine(line);
    return isPendingMarchPostresLine(line);
  });
}

const MARCH_PASS_SPECS: ReadonlyArray<{
  course: 2 | 3 | 4;
  action: PendingMarchPassAction;
}> = [
  { course: 2, action: "primeros" },
  { course: 3, action: "segundos" },
  { course: 4, action: "postres" },
];

/**
 * Aviso operativo: pase posterior con líneas pending y pases anteriores de
 * cocina ya liberados (sent/preparing/prepared/served). No exige served.
 * Requiere al menos un envío previo (Comanda) en la mesa.
 */
export function detectPendingMarchPassAlerts(
  lines: ReadonlyArray<ComandaReleaseLine>,
  comandaAlreadyIssued: boolean,
): PendingMarchPassAlert[] {
  if (!comandaAlreadyIssued) return [];

  const activeLines = lines.filter(isActiveLine);
  const alerts: PendingMarchPassAlert[] = [];

  for (const spec of MARCH_PASS_SPECS) {
    const pendingLines = pendingMarchLinesForCourse(activeLines, spec.course);
    if (pendingLines.length === 0) continue;
    if (!areEarlierKitchenPassesReleasedForMarch(activeLines, spec.course)) {
      continue;
    }

    const sectionLabel = getMenuCourseSectionLabel(spec.course);
    alerts.push({
      course: spec.course,
      label: `${sectionLabel} pendientes`,
      count: pendingLines.length,
      action: spec.action,
    });
  }

  return alerts;
}

/** Mapa TPV: etiqueta corta del primer pase pendiente de marcha (p. ej. «Segundos»). */
export function resolvePendingMarchPassMapHint(
  lines: ReadonlyArray<ComandaReleaseLine>,
  comandaAlreadyIssued: boolean,
): string | null {
  const alerts = detectPendingMarchPassAlerts(lines, comandaAlreadyIssued);
  if (alerts.length === 0) return null;
  return getMenuCourseSectionLabel(alerts[0]!.course);
}
