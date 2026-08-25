import type { CSSProperties } from "react";
import {
  isDecorativePlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";

function editorChromeForPlanType(
  planType: PlanElementType,
  tableShape: Table["tableShape"],
  preset: "default" | "premium" = "default",
): { borderRadius: number; background: string } {
  if (preset === "premium") {
    switch (planType) {
      case "sunbed":
        return { borderRadius: 7, background: "rgba(87, 83, 78, 0.45)" };
      case "bed":
        return { borderRadius: 16, background: "rgba(71, 85, 105, 0.4)" };
      case "wall":
        return {
          borderRadius: 2,
          background:
            "linear-gradient(180deg, rgba(37, 39, 36, 0.98) 0%, rgba(22, 24, 23, 1) 100%)",
        };
      case "bar":
        return {
          borderRadius: 12,
          background: [
            "linear-gradient(180deg, rgba(255, 248, 238, 0.06) 0%, transparent 22%)",
            "linear-gradient(180deg, rgba(78, 64, 50, 0.98) 0%, rgba(46, 38, 31, 0.99) 100%)",
          ].join(", "),
        };
      case "column":
        return { borderRadius: 999, background: "rgba(71, 85, 105, 0.85)" };
      case "pool":
        return {
          borderRadius: 16,
          background: [
            "repeating-linear-gradient(105deg, transparent 0, transparent 12px, rgba(255,255,255,0.035) 12px, rgba(255,255,255,0.035) 13px)",
            "radial-gradient(ellipse 95% 58% at 50% 16%, rgba(186, 230, 253, 0.22) 0%, transparent 60%)",
            "linear-gradient(172deg, rgba(56, 189, 248, 0.32) 0%, rgba(14, 100, 145, 0.4) 42%, rgba(6, 40, 62, 0.46) 100%)",
          ].join(", "),
        };
      case "door":
        return {
          borderRadius: 3,
          background:
            "linear-gradient(90deg, rgba(218, 196, 164, 0.5) 0%, rgba(245, 232, 206, 0.62) 50%, rgba(218, 196, 164, 0.5) 100%)",
        };
      case "planter":
        return {
          borderRadius: 999,
          background:
            "linear-gradient(180deg, rgba(62, 124, 82, 0.5) 0%, rgba(32, 78, 52, 0.55) 100%)",
        };
      case "custom":
        return {
          borderRadius: tableShape === "round" ? 999 : 10,
          background: "rgba(45, 55, 72, 0.58)",
        };
      default:
        return {
          borderRadius: tableShape === "round" ? 999 : 14,
          background:
            tableShape === "round"
              ? "linear-gradient(180deg, rgba(232, 225, 214, 0.96) 0%, rgba(202, 192, 176, 0.96) 100%)"
              : "linear-gradient(180deg, rgba(230, 224, 213, 0.96) 0%, rgba(199, 189, 173, 0.96) 100%)",
        };
    }
  }

  switch (planType) {
    case "sunbed":
      return { borderRadius: 6, background: "rgba(234, 179, 8, 0.42)" };
    case "bed":
      return { borderRadius: 16, background: "rgba(167, 139, 250, 0.4)" };
    case "wall":
      return { borderRadius: 2, background: "rgba(148, 163, 184, 0.35)" };
    case "bar":
      return { borderRadius: 8, background: "rgba(30, 41, 59, 0.95)" };
    case "column":
      return { borderRadius: 999, background: "rgba(51, 65, 85, 0.95)" };
    case "pool":
      return { borderRadius: 12, background: "rgba(125, 211, 252, 0.5)" };
    case "door":
      return { borderRadius: 4, background: "rgba(100, 116, 139, 0.55)" };
    case "planter":
      return { borderRadius: 8, background: "rgba(22, 101, 52, 0.45)" };
    case "custom":
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
    default:
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
  }
}

function editorBaseBorderForPlanType(
  planType: PlanElementType | undefined,
  preset: "default" | "premium" = "default",
  zoneColor?: string | null,
): string {
  const zoneBorder = zoneColor ? `1px solid ${zoneColor}` : undefined;
  if (preset === "premium") {
    if (planType === "wall") return zoneBorder ?? "1px solid rgba(18, 21, 24, 0.9)";
    if (planType === "door") return zoneBorder ?? "1px solid rgba(245, 222, 186, 0.46)";
    if (planType === "planter") return zoneBorder ?? "1px solid rgba(104, 168, 122, 0.42)";
    if (planType === "pool") return zoneBorder ?? "1px solid rgba(125, 211, 252, 0.48)";
    if (planType === "bar") return zoneBorder ?? "1px solid rgba(184, 160, 132, 0.42)";
    return zoneBorder ?? "1px solid rgba(125, 115, 98, 0.38)";
  }
  if (planType === "wall") return zoneBorder ?? "1px solid rgba(71, 85, 105, 0.52)";
  if (planType === "door") return zoneBorder ?? "1px solid rgba(180, 83, 9, 0.22)";
  if (planType === "planter") return zoneBorder ?? "1px solid rgba(22, 101, 52, 0.42)";
  if (planType === "pool") return zoneBorder ?? "1px solid rgba(56, 189, 248, 0.32)";
  return zoneBorder ?? "1px solid rgba(100, 116, 139, 0.38)";
}

function editorBaseShadowForPlanType(
  planType: PlanElementType | undefined,
  preset: "default" | "premium" = "default",
  zoneColor?: string | null,
): string {
  if (preset === "premium") {
    if (zoneColor) return `inset 0 1px 0 ${zoneColor}33, 0 4px 10px rgba(2, 6, 23, 0.12)`;
    if (planType === "pool") {
      return "inset 0 1px 0 rgba(255,255,255,0.08), 0 5px 14px rgba(8, 60, 90, 0.14), 0 2px 6px rgba(2, 6, 23, 0.12)";
    }
    if (planType === "bar") {
      return "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -7px 14px rgba(0,0,0,0.22), 0 5px 12px rgba(40, 34, 26, 0.18), 0 1px 3px rgba(0,0,0,0.12)";
    }
    if (planType && isDecorativePlanElementType(planType)) {
      return "inset 0 1px 0 rgba(255,255,255,0.05), 0 3px 9px rgba(2, 6, 23, 0.16), 0 1px 3px rgba(2, 6, 23, 0.1)";
    }
    return "inset 0 1px 0 rgba(255,255,255,0.22), 0 3px 8px rgba(40, 34, 26, 0.1), 0 1px 2px rgba(40, 34, 26, 0.06)";
  }
  if (zoneColor) return `inset 0 3px 0 ${zoneColor}, 0 1px 2px rgba(15, 23, 42, 0.12)`;
  return "0 1px 2px rgba(15, 23, 42, 0.12)";
}

export function getPlanElementBaseVisualStyle(
  element: Pick<Table, "type" | "tableShape">,
  preset: "default" | "premium" = "premium",
  zoneColor?: string | null,
): Pick<CSSProperties, "borderRadius" | "background" | "border" | "boxShadow"> {
  const chrome = editorChromeForPlanType(element.type, element.tableShape, preset);
  return {
    borderRadius: chrome.borderRadius,
    background: chrome.background,
    border: editorBaseBorderForPlanType(element.type, preset, zoneColor),
    boxShadow: editorBaseShadowForPlanType(element.type, preset, zoneColor),
  };
}
