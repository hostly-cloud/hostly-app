import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";

export type LandscapeToolboxItem = {
  kind: LandscapeElementKind;
  label: string;
  icon: string;
  description: string;
  workspaceHint: string;
};

export const LANDSCAPE_TOOLBOX_ITEMS: readonly LandscapeToolboxItem[] = [
  {
    kind: "rectangularPlanter",
    label: "Jardinera rectangular",
    icon: "▱",
    description: "Elemento vegetal lineal para separar zonas y recorridos.",
    workspaceHint: "Haz clic sobre el plano para colocar una jardinera rectangular.",
  },
  {
    kind: "roundPlanter",
    label: "Jardinera circular",
    icon: "◌",
    description: "Jardinera compacta para puntos verdes o separaciones suaves.",
    workspaceHint: "Haz clic sobre el plano para colocar una jardinera circular.",
  },
  {
    kind: "palm",
    label: "Palmera",
    icon: "🌴",
    description: "Elemento vertical de paisajismo para terrazas y beach clubs.",
    workspaceHint: "Haz clic sobre el plano para colocar una palmera.",
  },
  {
    kind: "olive",
    label: "Olivo",
    icon: "🌳",
    description: "Árbol mediterráneo suave para ambientar sin competir con la operación.",
    workspaceHint: "Haz clic sobre el plano para colocar un olivo.",
  },
  {
    kind: "tree",
    label: "Árbol",
    icon: "🌳",
    description: "Árbol de copa amplia para jardines, patios y terrazas.",
    workspaceHint: "Haz clic sobre el plano para colocar un árbol.",
  },
  {
    kind: "shrub",
    label: "Arbusto",
    icon: "🌿",
    description: "Volumen vegetal compacto para rincones y transiciones.",
    workspaceHint: "Haz clic sobre el plano para colocar un arbusto.",
  },
  {
    kind: "hedge",
    label: "Seto",
    icon: "▰",
    description: "Barrera vegetal lineal para delimitar jardín, terraza o recorridos.",
    workspaceHint: "Haz clic sobre el plano para colocar un seto.",
  },
  {
    kind: "flowers",
    label: "Flores",
    icon: "✿",
    description: "Macizo floral decorativo para jardines y zonas exteriores.",
    workspaceHint: "Haz clic sobre el plano para colocar un macizo de flores.",
  },
  {
    kind: "rock",
    label: "Roca",
    icon: "◆",
    description: "Elemento mineral para jardines, playas y paisajismo natural.",
    workspaceHint: "Haz clic sobre el plano para colocar una roca.",
  },
  {
    kind: "fountain",
    label: "Fuente",
    icon: "⛲",
    description: "Elemento de agua ornamental para patios y jardines.",
    workspaceHint: "Haz clic sobre el plano para colocar una fuente.",
  },
] as const;

export function getLandscapeToolboxItem(kind: LandscapeElementKind): LandscapeToolboxItem | undefined {
  return LANDSCAPE_TOOLBOX_ITEMS.find((item) => item.kind === kind);
}
