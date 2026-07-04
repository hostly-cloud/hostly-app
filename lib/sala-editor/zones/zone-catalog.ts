import type { ZoneType } from "@/lib/sala-editor/zones/zone";

export type ZoneCatalogItem = {
  type: ZoneType;
  label: string;
  description: string;
  color: string;
  workspaceHint: string;
};

export const ZONE_CATALOG: readonly ZoneCatalogItem[] = [
  {
    type: "dining",
    label: "Comedor",
    description: "Zona principal de servicio de mesas.",
    color: "#315f7d",
    workspaceHint: "Haz clic sobre el plano para colocar una zona de comedor.",
  },
  {
    type: "terrace",
    label: "Terraza",
    description: "Zona exterior de servicio.",
    color: "#4f7c6d",
    workspaceHint: "Haz clic sobre el plano para colocar una terraza.",
  },
  {
    type: "garden",
    label: "Jardín",
    description: "Zona verde o ajardinada con uso operativo.",
    color: "#6f8a55",
    workspaceHint: "Haz clic sobre el plano para colocar una zona de jardín.",
  },
  {
    type: "pool",
    label: "Piscina",
    description: "Zona funcional vinculada a piscina o agua.",
    color: "#3a8fb7",
    workspaceHint: "Haz clic sobre el plano para colocar una zona de piscina.",
  },
  {
    type: "vip",
    label: "VIP",
    description: "Zona premium o reservada.",
    color: "#7a5b9a",
    workspaceHint: "Haz clic sobre el plano para colocar una zona VIP.",
  },
  {
    type: "lounge",
    label: "Lounge",
    description: "Zona relajada de estancia o consumo.",
    color: "#65748a",
    workspaceHint: "Haz clic sobre el plano para colocar una zona lounge.",
  },
  {
    type: "bar",
    label: "Bar",
    description: "Zona funcional alrededor de barra.",
    color: "#6b5b4b",
    workspaceHint: "Haz clic sobre el plano para colocar una zona de bar.",
  },
  {
    type: "beach",
    label: "Beach",
    description: "Zona de playa o beach club.",
    color: "#b9935a",
    workspaceHint: "Haz clic sobre el plano para colocar una zona beach.",
  },
  {
    type: "rooftop",
    label: "Rooftop",
    description: "Zona en azotea o terraza superior.",
    color: "#506a86",
    workspaceHint: "Haz clic sobre el plano para colocar una zona rooftop.",
  },
  {
    type: "privateRoom",
    label: "Sala privada",
    description: "Zona cerrada o reservable como espacio privado.",
    color: "#8a6a3f",
    workspaceHint: "Haz clic sobre el plano para colocar una sala privada.",
  },
  {
    type: "events",
    label: "Eventos",
    description: "Zona flexible para eventos o grupos.",
    color: "#8c5f72",
    workspaceHint: "Haz clic sobre el plano para colocar una zona de eventos.",
  },
] as const;

export function getZoneCatalogItem(type: ZoneType): ZoneCatalogItem | undefined {
  return ZONE_CATALOG.find((item) => item.type === type);
}
