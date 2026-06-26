"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  ArrowRight,
  BedDouble,
  Brush,
  Building2,
  Camera,
  Check,
  Circle,
  Coffee,
  Construction,
  Crown,
  Disc3,
  DoorOpen,
  Factory,
  Flame,
  Gem,
  GlassWater,
  Grid3X3,
  House,
  Hotel,
  LayoutDashboard,
  Layers3,
  Leaf,
  Minus,
  Moon,
  Mountain,
  PanelsTopLeft,
  Palette,
  RectangleHorizontal,
  Music2,
  Palmtree,
  Plus,
  Scan,
  Sofa,
  Sparkles,
  Square,
  Store,
  Sun,
  SunMedium,
  Trees,
  Umbrella,
  Utensils,
  Waves,
} from "lucide-react";
import { HostlyPageHeader } from "@/components/hostly/page-header";
import {
  HostlyAlert,
  HostlyButton,
  HostlyCard,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import {
  buildRoomsAssistantDraft,
  estimateTableCount,
  persistRoomsAssistantDraft,
  type BarSeatingAnswer,
  type HighTablesAnswer,
  type OutdoorTablesAnswer,
  type RoomsAssistantDraft,
  type TableCountAnswer,
  type TableSizeDistribution,
  type TablesAnswers,
  type TerraceTablesAnswer,
} from "@/lib/rooms-assistant/draft";

export type RoomsAssistantBusinessType =
  | "restaurant"
  | "bar"
  | "cafe"
  | "beach-club"
  | "hotel"
  | "rooftop"
  | "chiringuito"
  | "nightclub"
  | "other";

type RoomsAssistantStep =
  | "business"
  | "spaces"
  | "summary"
  | "space-intro"
  | "structure"
  | "ambience"
  | "elements"
  | "elements-summary"
  | "service"
  | "service-summary"
  | "tables"
  | "tables-summary"
  | "final-summary"
  | "generating"
  | "ready";

type SpaceShape = "rectangular" | "square" | "l-shape" | "irregular" | "unknown";
type WallAnswer = "yes" | "no" | "partial";
type BinaryAnswer = "yes" | "no";

type StructureAnswers = {
  shape: SpaceShape | null;
  walls: WallAnswer | null;
  hasBar: BinaryAnswer | null;
  connectedTerrace: BinaryAnswer | null;
};

type FloorMaterial =
  | "tile"
  | "wood"
  | "parquet"
  | "stone"
  | "marble"
  | "concrete"
  | "microcement"
  | "decking"
  | "sand"
  | "grass"
  | "water"
  | "other";

type FloorTone =
  | "light"
  | "medium"
  | "dark"
  | "black"
  | "white"
  | "sand"
  | "gray"
  | "custom";

type LevelChange = "none" | "step" | "platform" | "ramp" | "multiple";

type AmbienceStyle =
  | "elegant"
  | "modern"
  | "mediterranean"
  | "industrial"
  | "tropical"
  | "minimal"
  | "rustic"
  | "chill-out"
  | "classic"
  | "other";

type AmbienceAnswers = {
  material: FloorMaterial | null;
  tone: FloorTone | null;
  uniformFloor: BinaryAnswer | null;
  levelChange: LevelChange | null;
  ambience: AmbienceStyle | null;
};

type StructuralDoor = "main" | "kitchen" | "emergency" | "terrace";
type WindowsAnswer = "none" | "few" | "many";
type ColumnsAnswer = "none" | "one-two" | "many";
type StructuralObstacle = "chimney" | "stage" | "planters" | "other";

type StructuralMultiOption<T extends string> = {
  id: T;
  label: string;
  description: string;
  icon: LucideIcon;
};

type StructuralSingleOption<T extends string> = StructuralMultiOption<T>;

type StructuralElementsAnswers = {
  doors: StructuralDoor[];
  windows: WindowsAnswer | null;
  columns: ColumnsAnswer | null;
  stairs: BinaryAnswer | null;
  elevator: BinaryAnswer | null;
  obstacles: StructuralObstacle[];
};

type ServiceBarAnswer = "none" | "left" | "right" | "back" | "center";
type ServiceCashierAnswer = "undefined" | "bar" | "reception" | "independent";
type ServiceReceptionAnswer = "none" | "entrance" | "inside";
type ServiceWaiterStationAnswer = "none" | "kitchen" | "bar" | "center";
type ServicePickupAnswer = "undefined" | "kitchen" | "bar" | "both";
type ServiceWaitingZoneAnswer = "none" | "entrance" | "bar" | "outdoor";

type ServiceElementsAnswers = {
  bar: ServiceBarAnswer | null;
  cashier: ServiceCashierAnswer | null;
  reception: ServiceReceptionAnswer | null;
  waiterStation: ServiceWaiterStationAnswer | null;
  pickup: ServicePickupAnswer | null;
  waitingZone: ServiceWaitingZoneAnswer | null;
};

type RoomsAssistantProps = {
  onOpenAdvancedEditor: () => void;
};

type BusinessOption = {
  id: RoomsAssistantBusinessType;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SpaceOption = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const BUSINESS_TYPES: BusinessOption[] = [
  {
    id: "restaurant",
    label: "Restaurante",
    description: "Salones, terrazas, barras y reservados.",
    icon: Utensils,
  },
  {
    id: "bar",
    label: "Bar",
    description: "Barras, mesas altas y zonas de pie.",
    icon: GlassWater,
  },
  {
    id: "cafe",
    label: "Cafetería",
    description: "Mesas ágiles, barra y servicio rápido.",
    icon: Coffee,
  },
  {
    id: "beach-club",
    label: "Beach Club",
    description: "Piscina, playa, hamacas y zonas VIP.",
    icon: Palmtree,
  },
  {
    id: "hotel",
    label: "Hotel",
    description: "Restaurante, lobby, piscina y rooftop.",
    icon: Hotel,
  },
  {
    id: "rooftop",
    label: "Rooftop",
    description: "Terrazas abiertas, barras y reservados.",
    icon: Sun,
  },
  {
    id: "chiringuito",
    label: "Chiringuito",
    description: "Terraza, playa, barra y servicio informal.",
    icon: Store,
  },
  {
    id: "nightclub",
    label: "Discoteca",
    description: "Barras, reservados y zonas de servicio.",
    icon: Disc3,
  },
  {
    id: "other",
    label: "Otro",
    description: "Hostly adaptará las siguientes preguntas.",
    icon: Building2,
  },
];

const SPACE_OPTIONS: SpaceOption[] = [
  {
    id: "main-room",
    label: "Salón principal",
    description: "El espacio interior principal.",
    icon: Armchair,
  },
  {
    id: "interior",
    label: "Interior",
    description: "Una zona interior flexible.",
    icon: DoorOpen,
  },
  {
    id: "restaurant",
    label: "Restaurante",
    description: "Área dedicada al servicio de comida.",
    icon: Utensils,
  },
  {
    id: "terrace",
    label: "Terraza",
    description: "Servicio exterior con mesas.",
    icon: Umbrella,
  },
  {
    id: "bar",
    label: "Barra",
    description: "Barra, taburetes y atención directa.",
    icon: GlassWater,
  },
  {
    id: "garden",
    label: "Jardín",
    description: "Zona exterior ajardinada.",
    icon: Trees,
  },
  {
    id: "pool",
    label: "Piscina",
    description: "Área operativa alrededor de piscina.",
    icon: Waves,
  },
  {
    id: "beach",
    label: "Playa",
    description: "Hamacas, camas y servicio de playa.",
    icon: Palmtree,
  },
  {
    id: "rooftop",
    label: "Rooftop",
    description: "Terraza elevada o azotea.",
    icon: Sun,
  },
  {
    id: "private",
    label: "Reservado",
    description: "Espacio privado o independiente.",
    icon: Sofa,
  },
  {
    id: "vip",
    label: "Zona VIP",
    description: "Servicio premium con acceso controlado.",
    icon: Crown,
  },
  {
    id: "chill-out",
    label: "Chill out",
    description: "Sofás y ambiente relajado.",
    icon: BedDouble,
  },
  {
    id: "lobby",
    label: "Lobby",
    description: "Recepción, espera y servicio informal.",
    icon: Hotel,
  },
  {
    id: "nightclub",
    label: "Discoteca",
    description: "Pista, reservados y barras.",
    icon: Music2,
  },
  {
    id: "other",
    label: "Otro",
    description: "Un espacio diferente a los anteriores.",
    icon: Plus,
  },
];

const RECOMMENDED_SPACES: Record<RoomsAssistantBusinessType, string[]> = {
  restaurant: ["main-room", "terrace", "bar"],
  bar: ["bar", "interior"],
  cafe: ["interior", "terrace"],
  "beach-club": ["beach", "pool", "restaurant", "terrace"],
  hotel: ["restaurant", "lobby", "terrace"],
  rooftop: ["rooftop", "bar", "vip"],
  chiringuito: ["terrace", "bar", "beach"],
  nightclub: ["nightclub", "bar", "vip"],
  other: ["interior"],
};

const SHAPE_OPTIONS: Array<{
  id: SpaceShape;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "rectangular",
    label: "Rectangular",
    description: "Más largo que ancho.",
    icon: RectangleHorizontal,
  },
  {
    id: "square",
    label: "Cuadrado",
    description: "Proporciones similares.",
    icon: Square,
  },
  {
    id: "l-shape",
    label: "En L",
    description: "Dos áreas conectadas.",
    icon: PanelsTopLeft,
  },
  {
    id: "irregular",
    label: "Irregular",
    description: "Tiene entrantes o varios ángulos.",
    icon: Scan,
  },
  {
    id: "unknown",
    label: "No lo sé",
    description: "Hostly propondrá una forma después.",
    icon: Sparkles,
  },
];

const INITIAL_STRUCTURE_ANSWERS: StructureAnswers = {
  shape: null,
  walls: null,
  hasBar: null,
  connectedTerrace: null,
};

const FLOOR_MATERIAL_OPTIONS: Array<{
  id: FloorMaterial;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "tile", label: "Baldosa", description: "Piezas cerámicas visibles.", icon: Grid3X3 },
  { id: "wood", label: "Madera", description: "Tablas de madera natural.", icon: Trees },
  { id: "parquet", label: "Parquet", description: "Madera interior más uniforme.", icon: Layers3 },
  { id: "stone", label: "Piedra", description: "Acabado mineral y con textura.", icon: Mountain },
  { id: "marble", label: "Mármol", description: "Superficie pulida y elegante.", icon: Gem },
  { id: "concrete", label: "Hormigón", description: "Acabado sólido e industrial.", icon: Construction },
  { id: "microcement", label: "Microcemento", description: "Superficie continua y moderna.", icon: Brush },
  { id: "decking", label: "Tarima exterior", description: "Lamas preparadas para exterior.", icon: Layers3 },
  { id: "sand", label: "Arena", description: "Playa o superficie arenosa.", icon: SunMedium },
  { id: "grass", label: "Césped", description: "Natural o artificial.", icon: Leaf },
  { id: "water", label: "Agua", description: "Piscina o superficie acuática.", icon: Waves },
  { id: "other", label: "Otro", description: "Un material diferente.", icon: Plus },
];

const FLOOR_TONE_OPTIONS: Array<{
  id: FloorTone;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "light", label: "Claro", description: "Luminoso y suave.", icon: Sun },
  { id: "medium", label: "Medio", description: "Equilibrado y natural.", icon: Circle },
  { id: "dark", label: "Oscuro", description: "Profundo y envolvente.", icon: Moon },
  { id: "black", label: "Negro", description: "Muy oscuro y contrastado.", icon: Circle },
  { id: "white", label: "Blanco", description: "Limpio y muy luminoso.", icon: Circle },
  { id: "sand", label: "Arena", description: "Cálido y mediterráneo.", icon: SunMedium },
  { id: "gray", label: "Gris", description: "Neutro y contemporáneo.", icon: Circle },
  { id: "custom", label: "Personalizado", description: "Lo definiremos más adelante.", icon: Palette },
];

const LEVEL_OPTIONS: Array<{
  id: LevelChange;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "none", label: "No", description: "Todo está al mismo nivel.", icon: Square },
  { id: "step", label: "Escalón", description: "Existe un cambio pequeño.", icon: Layers3 },
  { id: "platform", label: "Plataforma", description: "Una zona está elevada.", icon: PanelsTopLeft },
  { id: "ramp", label: "Rampa", description: "Hay una transición inclinada.", icon: Construction },
  { id: "multiple", label: "Varios niveles", description: "Conviven distintas alturas.", icon: Building2 },
];

const AMBIENCE_OPTIONS: Array<{
  id: AmbienceStyle;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "elegant", label: "Elegante", description: "Refinado y cuidado.", icon: Gem },
  { id: "modern", label: "Moderno", description: "Actual y geométrico.", icon: PanelsTopLeft },
  { id: "mediterranean", label: "Mediterráneo", description: "Luminoso, cálido y natural.", icon: Sun },
  { id: "industrial", label: "Industrial", description: "Metal, hormigón y contraste.", icon: Factory },
  { id: "tropical", label: "Tropical", description: "Vegetación y ambiente fresco.", icon: Palmtree },
  { id: "minimal", label: "Minimalista", description: "Pocos elementos y mucha calma.", icon: Square },
  { id: "rustic", label: "Rústico", description: "Madera, piedra y tradición.", icon: House },
  { id: "chill-out", label: "Chill Out", description: "Relajado, cómodo y social.", icon: Sofa },
  { id: "classic", label: "Clásico", description: "Atemporal y reconocible.", icon: Armchair },
  { id: "other", label: "Otro", description: "Un ambiente diferente.", icon: Plus },
];

const INITIAL_AMBIENCE_ANSWERS: AmbienceAnswers = {
  material: null,
  tone: null,
  uniformFloor: null,
  levelChange: null,
  ambience: null,
};

const STRUCTURAL_DOOR_OPTIONS: StructuralMultiOption<StructuralDoor>[] = [
  { id: "main", label: "Principal", description: "Acceso principal de clientes.", icon: DoorOpen },
  { id: "kitchen", label: "Cocina", description: "Conecta con cocina o pase.", icon: Utensils },
  { id: "emergency", label: "Emergencia", description: "Salida de seguridad o evacuación.", icon: Construction },
  { id: "terrace", label: "Terraza", description: "Paso directo a la zona exterior.", icon: Umbrella },
];

const WINDOWS_OPTIONS: StructuralSingleOption<WindowsAnswer>[] = [
  { id: "none", label: "Ninguna", description: "Sin aperturas visibles al exterior.", icon: Square },
  { id: "few", label: "Pocas", description: "Hay algunas entradas de luz.", icon: PanelsTopLeft },
  { id: "many", label: "Muchas", description: "La luz y las vistas son protagonistas.", icon: Sun },
];

const COLUMNS_OPTIONS: StructuralSingleOption<ColumnsAnswer>[] = [
  { id: "none", label: "Ninguna", description: "La circulación está libre de soportes.", icon: Square },
  { id: "one-two", label: "1-2", description: "Hay pocos puntos que condicionan el paso.", icon: Building2 },
  { id: "many", label: "Varias", description: "El espacio tiene varios soportes visibles.", icon: Layers3 },
];

const BINARY_STRUCTURAL_OPTIONS: StructuralSingleOption<BinaryAnswer>[] = [
  { id: "yes", label: "Sí", description: "Está presente en este espacio.", icon: Check },
  { id: "no", label: "No", description: "No condiciona este espacio ahora mismo.", icon: Circle },
];

const STRUCTURAL_OBSTACLE_OPTIONS: StructuralMultiOption<StructuralObstacle>[] = [
  { id: "chimney", label: "Chimenea", description: "Un volumen fijo que condiciona el plano.", icon: Flame },
  { id: "stage", label: "Escenario", description: "Zona elevada para eventos o música.", icon: Music2 },
  { id: "planters", label: "Jardineras", description: "Vegetación que divide o guía recorridos.", icon: Leaf },
  { id: "other", label: "Otros", description: "Algo importante que convendrá recordar después.", icon: Plus },
];

const RECOMMENDED_STRUCTURAL_PRESET: Record<
  RoomsAssistantBusinessType,
  Pick<StructuralElementsAnswers, "doors" | "obstacles">
> = {
  restaurant: { doors: ["main", "kitchen", "terrace"], obstacles: [] },
  bar: { doors: ["main"], obstacles: [] },
  cafe: { doors: ["main", "terrace"], obstacles: [] },
  "beach-club": { doors: ["main", "terrace"], obstacles: ["planters"] },
  hotel: { doors: ["main", "kitchen"], obstacles: [] },
  rooftop: { doors: ["main", "terrace"], obstacles: [] },
  chiringuito: { doors: ["main", "terrace"], obstacles: ["planters"] },
  nightclub: { doors: ["main", "emergency"], obstacles: ["stage"] },
  other: { doors: ["main"], obstacles: [] },
};

const INITIAL_STRUCTURAL_ELEMENTS_ANSWERS: StructuralElementsAnswers = {
  doors: [],
  windows: null,
  columns: null,
  stairs: null,
  elevator: null,
  obstacles: [],
};

const SERVICE_BAR_OPTIONS: StructuralSingleOption<ServiceBarAnswer>[] = [
  { id: "none", label: "No hay barra", description: "No existe una barra fija en este espacio.", icon: Circle },
  { id: "left", label: "Izquierda", description: "La barra se concentra en el lateral izquierdo.", icon: GlassWater },
  { id: "right", label: "Derecha", description: "La barra se concentra en el lateral derecho.", icon: GlassWater },
  { id: "back", label: "Fondo", description: "La barra está al fondo del espacio.", icon: PanelsTopLeft },
  { id: "center", label: "Centro", description: "La barra condiciona la circulación central.", icon: Grid3X3 },
];

const SERVICE_CASHIER_OPTIONS: StructuralSingleOption<ServiceCashierAnswer>[] = [
  { id: "undefined", label: "No definida", description: "Todavía no está claro el punto de cobro.", icon: Circle },
  { id: "bar", label: "Junto a la barra", description: "El cobro se resuelve en la barra principal.", icon: GlassWater },
  { id: "reception", label: "En recepción", description: "La caja se concentra en la bienvenida.", icon: LayoutDashboard },
  { id: "independent", label: "Independiente", description: "Existe un punto de cobro separado.", icon: Square },
];

const SERVICE_RECEPTION_OPTIONS: StructuralSingleOption<ServiceReceptionAnswer>[] = [
  { id: "none", label: "No hay recepción", description: "No existe un punto fijo de bienvenida.", icon: Circle },
  { id: "entrance", label: "Entrada principal", description: "La acogida se produce al entrar.", icon: DoorOpen },
  { id: "inside", label: "Interior de sala", description: "La bienvenida se hace ya dentro de la sala.", icon: Armchair },
];

const SERVICE_WAITER_STATION_OPTIONS: StructuralSingleOption<ServiceWaiterStationAnswer>[] = [
  { id: "none", label: "No hay estación", description: "No existe una base fija para camareros.", icon: Circle },
  { id: "kitchen", label: "Cerca de cocina", description: "La operación gira alrededor del pase.", icon: Utensils },
  { id: "bar", label: "Cerca de barra", description: "La base está junto al servicio de bebidas.", icon: GlassWater },
  { id: "center", label: "Zona central", description: "La estación ordena la sala desde el centro.", icon: Grid3X3 },
];

const SERVICE_PICKUP_OPTIONS: StructuralSingleOption<ServicePickupAnswer>[] = [
  { id: "undefined", label: "No definido", description: "Todavía no está claro el punto de recogida.", icon: Circle },
  { id: "kitchen", label: "Cocina", description: "La mayor parte de recogidas sale desde cocina.", icon: Utensils },
  { id: "bar", label: "Barra", description: "La recogida principal se hace en barra.", icon: GlassWater },
  { id: "both", label: "Cocina y barra", description: "El servicio se reparte entre ambos puntos.", icon: Layers3 },
];

const SERVICE_WAITING_ZONE_OPTIONS: StructuralSingleOption<ServiceWaitingZoneAnswer>[] = [
  { id: "none", label: "No hay zona de espera", description: "Los clientes no esperan en una zona específica.", icon: Circle },
  { id: "entrance", label: "Entrada", description: "La espera se concentra en el acceso principal.", icon: DoorOpen },
  { id: "bar", label: "Barra", description: "La espera se absorbe junto a la barra.", icon: GlassWater },
  { id: "outdoor", label: "Exterior / terraza", description: "La espera se deriva fuera de la sala principal.", icon: Umbrella },
];

const INITIAL_SERVICE_ELEMENTS_ANSWERS: ServiceElementsAnswers = {
  bar: null,
  cashier: null,
  reception: null,
  waiterStation: null,
  pickup: null,
  waitingZone: null,
};

const INITIAL_TABLES_ANSWERS: TablesAnswers = {
  approximateCount: null,
  sizeDistribution: null,
  highTables: null,
  barSeating: null,
  terraceTables: null,
  outdoorTables: null,
};

const TABLE_COUNT_OPTIONS: Array<{
  id: TableCountAnswer;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "up-to-15",
    label: "Hasta 15 mesas",
    description: "Local compacto o servicio reducido.",
    icon: Circle,
  },
  {
    id: "15-30",
    label: "Entre 15 y 30",
    description: "Operación media, varios turnos posibles.",
    icon: Grid3X3,
  },
  {
    id: "30-50",
    label: "Entre 30 y 50",
    description: "Sala amplia con varias zonas.",
    icon: LayoutDashboard,
  },
  {
    id: "50-plus",
    label: "Más de 50",
    description: "Gran capacidad o varios espacios.",
    icon: Layers3,
  },
];

const TABLE_SIZE_OPTIONS: Array<{
  id: TableSizeDistribution;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "mostly-2",
    label: "Sobre todo de 2",
    description: "Mesas pequeñas y rotación rápida.",
    icon: Circle,
  },
  {
    id: "mostly-4",
    label: "Sobre todo de 4",
    description: "El estándar de la mayoría de salones.",
    icon: Square,
  },
  {
    id: "balanced",
    label: "Mezcla equilibrada",
    description: "Combinas 2, 4 y alguna mesa grande.",
    icon: Grid3X3,
  },
  {
    id: "mostly-large",
    label: "Mesas grandes",
    description: "Predominan mesas de 6 o más comensales.",
    icon: RectangleHorizontal,
  },
];

const HIGH_TABLES_OPTIONS: Array<{
  id: HighTablesAnswer;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "none",
    label: "No hay mesas altas",
    description: "Todo el servicio es a mesa baja.",
    icon: Armchair,
  },
  {
    id: "some",
    label: "Algunas altas",
    description: "Zona de barra o mesas altas puntuales.",
    icon: Coffee,
  },
  {
    id: "many",
    label: "Muchas altas",
    description: "Buena parte del servicio es en altura.",
    icon: GlassWater,
  },
];

const BAR_SEATING_OPTIONS: Array<{
  id: BarSeatingAnswer;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "none",
    label: "Sin barra",
    description: "No hay servicio en barra.",
    icon: Circle,
  },
  {
    id: "small",
    label: "Barra pequeña",
    description: "Hasta unos 6 taburetes.",
    icon: Minus,
  },
  {
    id: "medium",
    label: "Barra media",
    description: "Entre 8 y 12 sitios.",
    icon: GlassWater,
  },
  {
    id: "large",
    label: "Barra grande",
    description: "Más de 12 sitios en barra.",
    icon: Layers3,
  },
];

const TERRACE_TABLES_OPTIONS: Array<{
  id: TerraceTablesAnswer;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "none",
    label: "Sin mesas en terraza",
    description: "La terraza no tiene mesas operativas.",
    icon: Circle,
  },
  {
    id: "few",
    label: "Pocas mesas",
    description: "Una zona exterior reducida.",
    icon: Umbrella,
  },
  {
    id: "half",
    label: "Aproximadamente la mitad",
    description: "Terraza relevante en el servicio.",
    icon: Sun,
  },
  {
    id: "most",
    label: "Casi todo en terraza",
    description: "El exterior concentra la operación.",
    icon: Palmtree,
  },
];

const OUTDOOR_TABLES_OPTIONS: Array<{
  id: OutdoorTablesAnswer;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "none",
    label: "Sin mesas exteriores",
    description: "El servicio es principalmente interior.",
    icon: DoorOpen,
  },
  {
    id: "few",
    label: "Pocas mesas",
    description: "Algún rincón exterior complementario.",
    icon: Trees,
  },
  {
    id: "some",
    label: "Varias mesas",
    description: "Exterior con peso operativo claro.",
    icon: Leaf,
  },
  {
    id: "many",
    label: "Muchas mesas",
    description: "Jardín, playa o azotea muy activos.",
    icon: Palmtree,
  },
];

const GENERATION_PROGRESS_MESSAGES = [
  "Analizando espacios...",
  "Preparando distribución...",
  "Colocando barra...",
  "Organizando circulación...",
  "Creando plano inicial...",
] as const;

type ProgressStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const PROGRESS_LABELS: Record<ProgressStep, string> = {
  1: "Tipo de negocio",
  2: "Espacios",
  3: "Estructura",
  4: "Suelo y ambiente",
  5: "Elementos estructurales",
  6: "Elementos de servicio",
  7: "Mesas",
  8: "Revisar",
};

const STAGE_RAIL_LABELS = [
  "Negocio",
  "Espacios",
  "Estructura",
  "Ambiente",
  "Elementos",
  "Servicio",
  "Mesas",
  "Revisar",
] as const;

function Progress({ step }: { step: ProgressStep }) {
  return (
    <div className="hostly-rooms-progress" aria-label={`Paso ${step} de 8`}>
      <div className="hostly-rooms-progress__meta">
        <span className="hostly-type-caption">Paso {step} de 8</span>
        <span className="hostly-type-caption">{PROGRESS_LABELS[step]}</span>
      </div>
      <div
        className="hostly-rooms-progress__track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={8}
        aria-valuenow={step}
      >
        <span
          className={`hostly-rooms-progress__value hostly-rooms-progress__value--${step}`}
        />
      </div>
    </div>
  );
}

function StructureStageRail({ activeStep }: { activeStep: 3 | 4 | 5 | 6 | 7 | 8 }) {
  const stages = STAGE_RAIL_LABELS.map((label, index) => {
    const stepNumber = index + 1;
    const state =
      stepNumber < activeStep
        ? "done"
        : stepNumber === activeStep
          ? "active"
          : "future";
    return { label, state };
  });

  return (
    <div className="hostly-rooms-stage-rail" aria-label="Progreso del asistente">
      {stages.map((stage) => (
        <div
          key={stage.label}
          className={`hostly-rooms-stage-rail__item is-${stage.state}`}
        >
          <span className="hostly-rooms-stage-rail__dot" aria-hidden>
            {stage.state === "done" ? <Check className="hostly-icon-sm" /> : null}
          </span>
          <span className="hostly-type-caption">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RoomsAssistant({
  onOpenAdvancedEditor,
}: RoomsAssistantProps) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<RoomsAssistantStep>("business");
  const [businessType, setBusinessType] =
    useState<RoomsAssistantBusinessType | null>(null);
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [structureQuestion, setStructureQuestion] = useState(0);
  const [structureAnswers, setStructureAnswers] = useState<StructureAnswers>(
    INITIAL_STRUCTURE_ANSWERS,
  );
  const [ambienceQuestion, setAmbienceQuestion] = useState(0);
  const [ambienceAnswers, setAmbienceAnswers] = useState<AmbienceAnswers>(
    INITIAL_AMBIENCE_ANSWERS,
  );
  const [structuralElementsAnswers, setStructuralElementsAnswers] =
    useState<StructuralElementsAnswers>(INITIAL_STRUCTURAL_ELEMENTS_ANSWERS);
  const [elementsInitialized, setElementsInitialized] = useState(false);
  const [phaseFiveComplete, setPhaseFiveComplete] = useState(false);
  const [serviceElementsAnswers, setServiceElementsAnswers] =
    useState<ServiceElementsAnswers>(INITIAL_SERVICE_ELEMENTS_ANSWERS);
  const [phaseSixComplete, setPhaseSixComplete] = useState(false);
  const [tableQuestion, setTableQuestion] = useState(0);
  const [tablesAnswers, setTablesAnswers] =
    useState<TablesAnswers>(INITIAL_TABLES_ANSWERS);
  const [phaseSevenComplete, setPhaseSevenComplete] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState<RoomsAssistantDraft | null>(
    null,
  );
  const [generationProgressIndex, setGenerationProgressIndex] = useState(0);

  const business = BUSINESS_TYPES.find((option) => option.id === businessType);
  const recommendedSpaceIds = businessType
    ? RECOMMENDED_SPACES[businessType]
    : [];
  const selectedSpaceOptions = selectedSpaces.flatMap((spaceId) => {
    const space = SPACE_OPTIONS.find((option) => option.id === spaceId);
    return space ? [space] : [];
  });
  const firstSpace = selectedSpaceOptions[0] ?? null;
  const recommendedStructuralPreset = businessType
    ? RECOMMENDED_STRUCTURAL_PRESET[businessType]
    : INITIAL_STRUCTURAL_ELEMENTS_ANSWERS;
  const selectedDoorOptions = structuralElementsAnswers.doors.flatMap((doorId) => {
    const door = STRUCTURAL_DOOR_OPTIONS.find((option) => option.id === doorId);
    return door ? [door] : [];
  });
  const selectedObstacleOptions = structuralElementsAnswers.obstacles.flatMap(
    (obstacleId) => {
      const obstacle = STRUCTURAL_OBSTACLE_OPTIONS.find(
        (option) => option.id === obstacleId,
      );
      return obstacle ? [obstacle] : [];
    },
  );

  const resetElements = () => {
    setStructuralElementsAnswers(INITIAL_STRUCTURAL_ELEMENTS_ANSWERS);
    setElementsInitialized(false);
    setPhaseFiveComplete(false);
    setServiceElementsAnswers(INITIAL_SERVICE_ELEMENTS_ANSWERS);
    setPhaseSixComplete(false);
    setTableQuestion(0);
    setTablesAnswers(INITIAL_TABLES_ANSWERS);
    setPhaseSevenComplete(false);
    setAssistantDraft(null);
    setGenerationProgressIndex(0);
  };

  const chooseBusiness = (id: RoomsAssistantBusinessType) => {
    if (id === businessType) return;
    setBusinessType(id);
    setSelectedSpaces([...RECOMMENDED_SPACES[id]]);
    setStructureQuestion(0);
    setStructureAnswers(INITIAL_STRUCTURE_ANSWERS);
    setAmbienceQuestion(0);
    setAmbienceAnswers(INITIAL_AMBIENCE_ANSWERS);
    resetElements();
  };

  const toggleSpace = (id: string) => {
    setSelectedSpaces((current) =>
      current.includes(id)
        ? current.filter((spaceId) => spaceId !== id)
        : [...current, id],
    );
    setStructureQuestion(0);
    setStructureAnswers(INITIAL_STRUCTURE_ANSWERS);
    setAmbienceQuestion(0);
    setAmbienceAnswers(INITIAL_AMBIENCE_ANSWERS);
    resetElements();
  };

  const selectStructureAnswer = (value: string) => {
    setStructureAnswers((current) => {
      if (structureQuestion === 0) {
        return { ...current, shape: value as SpaceShape };
      }
      if (structureQuestion === 1) {
        return { ...current, walls: value as WallAnswer };
      }
      if (structureQuestion === 2) {
        return { ...current, hasBar: value as BinaryAnswer };
      }
      return { ...current, connectedTerrace: value as BinaryAnswer };
    });
  };

  const currentStructureAnswer =
    structureQuestion === 0
      ? structureAnswers.shape
      : structureQuestion === 1
        ? structureAnswers.walls
        : structureQuestion === 2
          ? structureAnswers.hasBar
          : structureAnswers.connectedTerrace;

  const selectAmbienceAnswer = (value: string) => {
    setAmbienceAnswers((current) => {
      if (ambienceQuestion === 0) {
        return { ...current, material: value as FloorMaterial };
      }
      if (ambienceQuestion === 1) {
        return { ...current, tone: value as FloorTone };
      }
      if (ambienceQuestion === 2) {
        return { ...current, uniformFloor: value as BinaryAnswer };
      }
      if (ambienceQuestion === 3) {
        return { ...current, levelChange: value as LevelChange };
      }
      return { ...current, ambience: value as AmbienceStyle };
    });
  };

  const currentAmbienceAnswer =
    ambienceQuestion === 0
      ? ambienceAnswers.material
      : ambienceQuestion === 1
        ? ambienceAnswers.tone
        : ambienceQuestion === 2
          ? ambienceAnswers.uniformFloor
          : ambienceQuestion === 3
            ? ambienceAnswers.levelChange
            : ambienceAnswers.ambience;

  const openElementsPhase = () => {
    if (!elementsInitialized) {
      setStructuralElementsAnswers({
        ...INITIAL_STRUCTURAL_ELEMENTS_ANSWERS,
        doors: [...recommendedStructuralPreset.doors],
        obstacles: [...recommendedStructuralPreset.obstacles],
      });
      setElementsInitialized(true);
    }
    setPhaseFiveComplete(false);
    setStep("elements");
  };

  const toggleMultiValue = (
    key: "doors" | "obstacles",
    value: StructuralDoor | StructuralObstacle,
  ) => {
    setStructuralElementsAnswers((current) => {
      const currentValues = current[key] as Array<StructuralDoor | StructuralObstacle>;
      return {
        ...current,
        [key]: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      } as StructuralElementsAnswers;
    });
    setPhaseFiveComplete(false);
  };

  const selectSingleStructuralValue = <
    K extends "windows" | "columns" | "stairs" | "elevator",
  >(
    key: K,
    value: StructuralElementsAnswers[K],
  ) => {
    setStructuralElementsAnswers((current) => ({
      ...current,
      [key]: value,
    }));
    setPhaseFiveComplete(false);
  };

  const elementsStepComplete =
    structuralElementsAnswers.windows !== null &&
    structuralElementsAnswers.columns !== null &&
    structuralElementsAnswers.stairs !== null &&
    structuralElementsAnswers.elevator !== null;

  const selectServiceAnswer = <
    K extends keyof ServiceElementsAnswers,
  >(
    key: K,
    value: ServiceElementsAnswers[K],
  ) => {
    setServiceElementsAnswers((current) => ({
      ...current,
      [key]: value,
    }));
    setPhaseSixComplete(false);
  };

  const serviceStepComplete =
    serviceElementsAnswers.bar !== null &&
    serviceElementsAnswers.cashier !== null &&
    serviceElementsAnswers.reception !== null &&
    serviceElementsAnswers.waiterStation !== null &&
    serviceElementsAnswers.pickup !== null &&
    serviceElementsAnswers.waitingZone !== null;

  const getOptionLabel = <T extends string>(
    options: Array<StructuralSingleOption<T>>,
    value: T | null,
  ) => options.find((option) => option.id === value)?.label ?? "Sin indicar";

  const hasTerraceSpace = selectedSpaces.includes("terrace");
  const hasOutdoorSpaces = selectedSpaces.some((spaceId) =>
    ["garden", "beach", "rooftop", "pool", "chill-out"].includes(spaceId),
  );

  const tableQuestionKeys = [
    "approximateCount",
    "sizeDistribution",
    "highTables",
    "barSeating",
    ...(hasTerraceSpace ? (["terraceTables"] as const) : []),
    ...(hasOutdoorSpaces ? (["outdoorTables"] as const) : []),
  ] as const;

  type TableQuestionKey = (typeof tableQuestionKeys)[number];

  const currentTableQuestionKey: TableQuestionKey | undefined =
    tableQuestionKeys[tableQuestion];

  const selectTableAnswer = (value: string) => {
    if (!currentTableQuestionKey) return;
    setTablesAnswers((current) => ({
      ...current,
      [currentTableQuestionKey]: value,
    }));
    setPhaseSevenComplete(false);
  };

  const currentTableAnswer = currentTableQuestionKey
    ? tablesAnswers[currentTableQuestionKey]
    : null;

  const buildCurrentDraft = (): RoomsAssistantDraft | null => {
    if (!businessType) return null;
    return buildRoomsAssistantDraft({
      businessType,
      spaces: selectedSpaces,
      structure: structureAnswers,
      ambience: ambienceAnswers,
      structuralElements: structuralElementsAnswers,
      serviceElements: serviceElementsAnswers,
      tables: {
        ...tablesAnswers,
        terraceTables: hasTerraceSpace
          ? tablesAnswers.terraceTables
          : "none",
        outdoorTables: hasOutdoorSpaces
          ? tablesAnswers.outdoorTables
          : "none",
      },
    });
  };

  const startPlanGeneration = () => {
    const draft = buildCurrentDraft();
    if (!draft) return;
    persistRoomsAssistantDraft(draft);
    setAssistantDraft(draft);
    setGenerationProgressIndex(0);
    setStep("generating");
  };

  const openEditorWithDraft = () => {
    const draft = assistantDraft ?? buildCurrentDraft();
    if (draft) {
      persistRoomsAssistantDraft(draft);
      setAssistantDraft(draft);
    }
    onOpenAdvancedEditor();
  };

  useEffect(() => {
    if (step !== "generating") return;
    if (generationProgressIndex >= GENERATION_PROGRESS_MESSAGES.length) return;

    const timer = window.setTimeout(() => {
      const nextIndex = generationProgressIndex + 1;
      setGenerationProgressIndex(nextIndex);
      if (nextIndex >= GENERATION_PROGRESS_MESSAGES.length) {
        setStep("ready");
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [step, generationProgressIndex]);

  if (!started) {
    return (
      <div className="hostly-rooms-onboarding flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Salas"
          subtitle="Configura tu restaurante de una forma sencilla y guiada."
        />

        <main className="hostly-rooms-onboarding__welcome mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-[var(--hostly-page-pad-x)] py-6 sm:py-10">
          <HostlySurface
            variant="ice"
            className="hostly-rooms-welcome-shell w-full"
          >
            <div className="hostly-rooms-welcome-hero text-center">
              <div className="hostly-rooms-welcome-hero__icon mx-auto flex items-center justify-center rounded-full bg-[var(--hostly-accent-soft)] text-[var(--hostly-accent)]">
                <Sparkles className="hostly-icon-xl" aria-hidden />
              </div>
              <p className="hostly-rooms-eyebrow hostly-type-caption">
                Asistente de Salas · unos 3 minutos
              </p>
              <h1 className="hostly-rooms-welcome-title hostly-type-page-title text-[var(--hostly-ink-strong)]">
                Vamos a montar juntos tu restaurante
              </h1>
              <p className="hostly-rooms-welcome-copy hostly-type-body mx-auto text-[var(--hostly-ink-muted)]">
                Hostly te hará unas preguntas sencillas y preparará una sala lista
                para usar desde el TPV. Podrás revisar y ajustar todo más adelante.
              </p>
            </div>

            <div className="hostly-rooms-paths">
              <HostlyCard
                family="action"
                className="hostly-rooms-path hostly-rooms-path--primary flex flex-col"
              >
                <div className="hostly-rooms-path__icon flex items-center justify-center rounded-xl bg-[var(--hostly-accent-soft)] text-[var(--hostly-accent)]">
                  <LayoutDashboard className="hostly-icon-lg" aria-hidden />
                </div>
                <div className="hostly-rooms-path__content">
                  <span className="hostly-rooms-path__badge hostly-type-caption">
                    Recomendado
                  </span>
                  <h2 className="hostly-type-section-title text-[var(--hostly-ink-strong)]">
                    Asistente de Salas
                  </h2>
                  <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                    Crea tus espacios paso a paso, sin enfrentarte a un editor
                    vacío.
                  </p>
                </div>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-path__action w-full"
                  onClick={() => setStarted(true)}
                >
                  Empezar
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </HostlyCard>

              <HostlyCard
                family="configuration"
                className="hostly-rooms-path flex flex-col"
              >
                <div className="hostly-rooms-path__icon flex items-center justify-center rounded-xl bg-[var(--hostly-ice-100)] text-[var(--hostly-ink-muted)]">
                  <BedDouble className="hostly-icon-lg" aria-hidden />
                </div>
                <div className="hostly-rooms-path__content">
                  <h2 className="hostly-type-card-title text-[var(--hostly-ink-strong)]">
                    Editor avanzado
                  </h2>
                  <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                    Para usuarios que quieren colocar y ajustar cada elemento
                    manualmente.
                  </p>
                </div>
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-path__action w-full"
                  onClick={onOpenAdvancedEditor}
                >
                  Abrir editor
                </HostlyButton>
              </HostlyCard>

              <HostlyCard
                family="configuration"
                className="hostly-rooms-path hostly-rooms-path--future flex flex-col"
              >
                <div className="hostly-rooms-path__icon flex items-center justify-center rounded-xl bg-[var(--hostly-ice-100)] text-[var(--hostly-ink-muted)]">
                  <Camera className="hostly-icon-lg" aria-hidden />
                </div>
                <div className="hostly-rooms-path__content">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="hostly-type-card-title text-[var(--hostly-ink-strong)]">
                      Crear desde fotos
                    </h2>
                    <span className="hostly-rooms-ai-badge hostly-type-caption">
                      Próximamente IA
                    </span>
                  </div>
                  <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                    Convierte una foto, plano o boceto en una propuesta que siempre
                    podrás revisar.
                  </p>
                </div>
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-path__action w-full"
                  disabled
                >
                  Próximamente
                </HostlyButton>
              </HostlyCard>
            </div>
          </HostlySurface>
        </main>
      </div>
    );
  }

  if (step === "summary") {
    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-step mx-auto flex w-full max-w-4xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={2} />
          <HostlySectionHeader
            title="Así queda tu negocio"
            description="Revisa la propuesta antes de seguir. Todavía puedes cambiar cualquier espacio."
            className="hostly-rooms-step__heading"
          />

          <HostlySurface
            variant="elevated"
            className="hostly-rooms-summary"
          >
            <div className="hostly-rooms-summary__section">
              <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                Tipo de negocio
              </span>
              <div className="hostly-rooms-summary__business">
                {business ? (
                  <>
                    <span className="hostly-rooms-summary__icon">
                      <business.icon className="hostly-icon-lg" aria-hidden />
                    </span>
                    <strong className="hostly-type-section-title">
                      {business.label}
                    </strong>
                  </>
                ) : null}
              </div>
            </div>

            <div className="hostly-rooms-summary__divider" />

            <div className="hostly-rooms-summary__section">
              <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                Espacios · {selectedSpaceOptions.length}
              </span>
              <div className="hostly-rooms-summary__spaces">
                {selectedSpaceOptions.map((space) => (
                  <span key={space.id} className="hostly-rooms-summary-chip">
                    <Check className="hostly-icon-sm" aria-hidden />
                    {space.label}
                  </span>
                ))}
              </div>
            </div>
          </HostlySurface>

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="secondary"
              className="hostly-rooms-step-nav__button"
              onClick={() => setStep("spaces")}
            >
              Editar espacios
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              onClick={() => setStep("space-intro")}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "space-intro") {
    const FirstSpaceIcon = firstSpace?.icon ?? Armchair;

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-transition mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-[var(--hostly-page-pad-x)] py-6 sm:py-10">
          <Progress step={3} />
          <div className="hostly-rooms-transition__copy text-center">
            <p className="hostly-rooms-eyebrow hostly-type-caption">Perfecto</p>
            <h1 className="hostly-type-page-title">
              Ya sabemos cómo es tu negocio
            </h1>
            <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
              Ahora vamos a crear tu primer espacio.
            </p>
          </div>

          <HostlyCard
            family="action"
            className="hostly-rooms-first-space-card"
          >
            <span className="hostly-rooms-first-space-card__icon">
              <FirstSpaceIcon className="hostly-icon-xl" aria-hidden />
            </span>
            <div className="hostly-rooms-first-space-card__content">
              <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                Primer espacio
              </span>
              <h2 className="hostly-type-section-title">
                {firstSpace?.label ?? "Espacio principal"}
              </h2>
              <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                {firstSpace?.description ??
                  "Aquí atenderás normalmente a tus clientes."}
              </p>
              <p className="hostly-rooms-first-space-card__time hostly-type-caption">
                Tiempo estimado · 1–2 minutos
              </p>
            </div>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-first-space-card__action"
              onClick={() => {
                setStructureQuestion(0);
                setStep("structure");
              }}
            >
              Empezar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </HostlyCard>

          <HostlyButton
            variant="ghost"
            className="hostly-rooms-transition__back"
            onClick={() => setStep("summary")}
          >
            Atrás
          </HostlyButton>
        </main>
      </div>
    );
  }

  if (step === "structure") {
    const structureComplete = structureQuestion >= 4;
    const questionTitle =
      structureQuestion === 0
        ? "¿Qué forma tiene aproximadamente este espacio?"
        : structureQuestion === 1
          ? "¿Tiene paredes?"
          : structureQuestion === 2
            ? "¿Hay barra?"
            : "¿Tiene una terraza conectada?";
    const questionHelp =
      structureQuestion === 0
        ? "Esto nos ayudará a proponerte un punto de partida. No hace falta que sea exacto."
        : structureQuestion === 1
          ? "Así sabremos si el espacio necesita límites completos o puede mantenerse abierto."
          : structureQuestion === 2
            ? "La barra cambia la forma de organizar la circulación y el servicio."
            : "La conexión nos ayudará a entender cómo se relacionan ambos espacios.";
    const simpleOptions =
      structureQuestion === 1
        ? [
            { id: "yes", label: "Sí", description: "Está delimitado por paredes." },
            { id: "no", label: "No", description: "Es un espacio abierto." },
            {
              id: "partial",
              label: "Solo algunas",
              description: "Combina paredes y zonas abiertas.",
            },
          ]
        : [
            { id: "yes", label: "Sí", description: "Forma parte de este espacio." },
            { id: "no", label: "No", description: "No necesitamos tenerlo en cuenta." },
          ];
    const questionOptions: Array<{
      id: string;
      label: string;
      description: string;
      icon?: LucideIcon;
    }> = structureQuestion === 0 ? SHAPE_OPTIONS : simpleOptions;

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-5xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={3} />
          <StructureStageRail activeStep={3} />

          {structureComplete ? (
            <>
              <HostlySurface
                variant="elevated"
                className="hostly-rooms-structure-complete"
              >
                <span className="hostly-rooms-structure-complete__icon">
                  <Check className="hostly-icon-xl" aria-hidden />
                </span>
                <p className="hostly-rooms-eyebrow hostly-type-caption">
                  Estructura comprendida
                </p>
                <h1 className="hostly-type-page-title">
                  Perfecto. Ya entendemos {firstSpace?.label ?? "tu primer espacio"}.
                </h1>
                <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                  Con estas respuestas Hostly podrá proponerte una base sencilla.
                  Todavía no hemos creado paredes, elementos ni mesas.
                </p>
              </HostlySurface>
              <HostlyAlert tone="success" title="Decisiones guardadas en esta sesión">
                La siguiente fase podrá usar este contexto para preparar los
                elementos del espacio.
              </HostlyAlert>
              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => setStructureQuestion(3)}
                >
                  Revisar respuestas
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => {
                    setAmbienceQuestion(0);
                    setStep("ambience");
                  }}
                >
                  Suelo y ambiente
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          ) : (
            <>
              <div className="hostly-rooms-structure__context">
                <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                  Vamos a construir
                </span>
                <strong className="hostly-type-section-title">
                  {firstSpace?.label ?? "Espacio principal"}
                </strong>
              </div>

              <HostlySectionHeader
                title={questionTitle}
                description={questionHelp}
                className="hostly-rooms-step__heading"
              />

              <div
                className={`hostly-rooms-question-grid ${
                  structureQuestion === 0 ? "is-shapes" : ""
                }`}
                role="radiogroup"
                aria-label={questionTitle}
              >
                {questionOptions.map((option) => {
                    const selected = currentStructureAnswer === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectStructureAnswer(option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${
                            selected ? "is-selected" : ""
                          }`}
                        >
                          {Icon ? (
                            <span className="hostly-rooms-question-card__icon">
                              <Icon className="hostly-icon-xl" aria-hidden />
                            </span>
                          ) : null}
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">
                              {option.label}
                            </strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                          <span
                            className={`hostly-rooms-space-check ${
                              selected ? "is-selected" : ""
                            }`}
                            aria-hidden
                          >
                            {selected ? (
                              <Check className="hostly-icon-sm" />
                            ) : null}
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
              </div>

              <p className="hostly-rooms-question-count hostly-type-caption">
                Pregunta {structureQuestion + 1} de 4 · Podrás modificarlo después
              </p>

              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="ghost"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => {
                    if (structureQuestion === 0) {
                      setStep("space-intro");
                    } else {
                      setStructureQuestion((current) => current - 1);
                    }
                  }}
                >
                  Atrás
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  disabled={!currentStructureAnswer}
                  onClick={() =>
                    setStructureQuestion((current) => current + 1)
                  }
                >
                  Continuar
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  if (step === "elements") {
    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={5} />
          <StructureStageRail activeStep={5} />

          <HostlySurface variant="ice" className="hostly-rooms-elements-hero">
            <span className="hostly-rooms-elements-hero__icon">
              <Scan className="hostly-icon-lg" aria-hidden />
            </span>
            <div>
              <p className="hostly-rooms-eyebrow hostly-type-caption">
                Elementos estructurales
              </p>
              <h1 className="hostly-type-section-title">
                Perfecto. Ya conocemos la estructura y el ambiente.
              </h1>
              <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                Ahora identifica los elementos f?sicos b?sicos de {firstSpace?.label ?? "este espacio"}. Hostly ha marcado una
                propuesta inicial que puedes corregir.
              </p>
            </div>
          </HostlySurface>

          <HostlyAlert tone="info" title="Contexto f?sico b?sico">
            Estos elementos ayudan a Hostly a generar un plano inicial m?s realista. Todav?a no vamos a dibujar ni colocar nada.
          </HostlyAlert>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Puertas"
                description="Selecciona todos los accesos que ya sabes que existen."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-elements-grid" role="group" aria-label="Puertas">
                {STRUCTURAL_DOOR_OPTIONS.map((door) => {
                  const selected = structuralElementsAnswers.doors.includes(door.id);
                  const recommended = recommendedStructuralPreset.doors.includes(door.id);
                  const Icon = door.icon;

                  return (
                    <button
                      key={door.id}
                      type="button"
                      aria-pressed={selected}
                      className="hostly-rooms-space-option"
                      onClick={() => toggleMultiValue("doors", door.id)}
                    >
                      <HostlyCard
                        family="action"
                        className={`hostly-rooms-space-card hostly-rooms-element-card ${
                          selected ? "hostly-rooms-space-card--selected" : ""
                        }`}
                      >
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                        <span className="hostly-rooms-space-card__copy">
                          <span className="hostly-rooms-element-card__heading">
                            <strong className="hostly-rooms-space-card__title hostly-type-card-title">
                              {door.label}
                            </strong>
                            {recommended ? (
                              <span className="hostly-rooms-element-card__recommended hostly-type-caption">
                                Recomendado
                              </span>
                            ) : null}
                          </span>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {door.description}
                          </span>
                        </span>
                        <span
                          className={`hostly-rooms-space-check ${
                            selected ? "is-selected" : ""
                          }`}
                          aria-hidden
                        >
                          {selected ? <Check className="hostly-icon-sm" /> : null}
                        </span>
                      </HostlyCard>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Ventanas"
                description="Solo necesitamos una lectura general del espacio."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Ventanas">
                {WINDOWS_OPTIONS.map((option) => {
                  const selected = structuralElementsAnswers.windows === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectSingleStructuralValue("windows", option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                      >
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">{option.label}</strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Columnas"
                description="As? Hostly sabr? si hay soportes que condicionan la circulaci?n."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Columnas">
                {COLUMNS_OPTIONS.map((option) => {
                  const selected = structuralElementsAnswers.columns === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectSingleStructuralValue("columns", option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                      >
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">{option.label}</strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Escaleras"
                  description="Indica si este espacio est? conectado por escaleras."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Escaleras">
                  {BINARY_STRUCTURAL_OPTIONS.map((option) => {
                    const selected = structuralElementsAnswers.stairs === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectSingleStructuralValue("stairs", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Ascensor"
                  description="Solo confirma si existe un acceso vertical relevante."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Ascensor">
                  {BINARY_STRUCTURAL_OPTIONS.map((option) => {
                    const selected = structuralElementsAnswers.elevator === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectSingleStructuralValue("elevator", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Obst?culos importantes"
                description="Opcional. Marca solo lo que realmente pueda afectar a un primer plano."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-elements-grid" role="group" aria-label="Obst?culos importantes">
                {STRUCTURAL_OBSTACLE_OPTIONS.map((obstacle) => {
                  const selected = structuralElementsAnswers.obstacles.includes(obstacle.id);
                  const recommended = recommendedStructuralPreset.obstacles.includes(obstacle.id);
                  const Icon = obstacle.icon;

                  return (
                    <button
                      key={obstacle.id}
                      type="button"
                      aria-pressed={selected}
                      className="hostly-rooms-space-option"
                      onClick={() => toggleMultiValue("obstacles", obstacle.id)}
                    >
                      <HostlyCard
                        family="action"
                        className={`hostly-rooms-space-card hostly-rooms-element-card ${
                          selected ? "hostly-rooms-space-card--selected" : ""
                        }`}
                      >
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                        <span className="hostly-rooms-space-card__copy">
                          <span className="hostly-rooms-element-card__heading">
                            <strong className="hostly-rooms-space-card__title hostly-type-card-title">
                              {obstacle.label}
                            </strong>
                            {recommended ? (
                              <span className="hostly-rooms-element-card__recommended hostly-type-caption">
                                Recomendado
                              </span>
                            ) : null}
                          </span>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {obstacle.description}
                          </span>
                        </span>
                        <span
                          className={`hostly-rooms-space-check ${
                            selected ? "is-selected" : ""
                          }`}
                          aria-hidden
                        >
                          {selected ? <Check className="hostly-icon-sm" /> : null}
                        </span>
                      </HostlyCard>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="ghost"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setStep("ambience");
                setAmbienceQuestion(5);
              }}
            >
              Atr?s
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              disabled={!elementsStepComplete}
              onClick={() => setStep("elements-summary")}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "elements-summary") {
    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={5} />
          <StructureStageRail activeStep={5} />

          <HostlySurface variant="elevated" className="hostly-rooms-elements-summary">
            <span className="hostly-rooms-elements-summary__icon">
              <Check className="hostly-icon-xl" aria-hidden />
            </span>
            <p className="hostly-rooms-eyebrow hostly-type-caption">
              Hostly ya conoce este espacio
            </p>
            <h1 className="hostly-type-page-title">
              {firstSpace?.label ?? "Primer espacio"}
            </h1>
            <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
              En el siguiente paso ubicaremos los puntos principales de servicio.
            </p>

            <div className="hostly-rooms-elements-summary__content">
              <div>
                <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                  Elementos
                </span>
                <div className="hostly-rooms-summary__spaces">
                  {selectedDoorOptions.length > 0 ? (
                    selectedDoorOptions.map((door) => (
                      <span key={door.id} className="hostly-rooms-summary-chip">
                        <Check className="hostly-icon-sm" aria-hidden />
                        Puerta: {door.label}
                      </span>
                    ))
                  ) : (
                    <span className="hostly-rooms-summary-chip">Puertas: sin indicar</span>
                  )}
                  <span className="hostly-rooms-summary-chip">
                    Ventanas:{" "}
                    {WINDOWS_OPTIONS.find(
                      (option) => option.id === structuralElementsAnswers.windows,
                    )?.label ?? "Sin indicar"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Columnas:{" "}
                    {COLUMNS_OPTIONS.find(
                      (option) => option.id === structuralElementsAnswers.columns,
                    )?.label ?? "Sin indicar"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Escaleras: {structuralElementsAnswers.stairs === "yes" ? "Si" : "No"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Ascensor: {structuralElementsAnswers.elevator === "yes" ? "Si" : "No"}
                  </span>
                  {selectedObstacleOptions.length > 0 ? (
                    selectedObstacleOptions.map((obstacle) => (
                      <span key={obstacle.id} className="hostly-rooms-summary-chip">
                        <Check className="hostly-icon-sm" aria-hidden />
                        Obstaculo: {obstacle.label}
                      </span>
                    ))
                  ) : (
                    <span className="hostly-rooms-summary-chip">
                      Obstaculos: ninguno relevante
                    </span>
                  )}
                </div>
              </div>
            </div>
          </HostlySurface>

          {phaseFiveComplete ? (
            <HostlyAlert tone="success" title="Espacio preparado para la Fase 6">
              La estructura, el ambiente y los elementos permanecen únicamente en
              esta sesión. Todavía no se ha creado ningún plano.
            </HostlyAlert>
          ) : null}

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="secondary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setPhaseFiveComplete(false);
                setStep("elements");
              }}
            >
              Editar elementos
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setPhaseFiveComplete(true);
                setStep("service");
              }}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "service") {
    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={6} />
          <StructureStageRail activeStep={6} />

          <HostlySurface variant="ice" className="hostly-rooms-elements-hero">
            <span className="hostly-rooms-elements-hero__icon">
              <GlassWater className="hostly-icon-lg" aria-hidden />
            </span>
            <div>
              <p className="hostly-rooms-eyebrow hostly-type-caption">
                Elementos de servicio
              </p>
              <h1 className="hostly-type-section-title">
                Ahora vamos a ubicar los puntos clave de operacion
              </h1>
              <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                Estos puntos ayudan a Hostly a colocar la barra, la caja y las zonas de trabajo sin bloquear el servicio.
              </p>
            </div>
          </HostlySurface>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Barra"
                description="La barra afecta a la circulacion de camareros y al punto de servicio principal."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Barra">
                {SERVICE_BAR_OPTIONS.map((option) => {
                  const selected = serviceElementsAnswers.bar === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectServiceAnswer("bar", option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                      >
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">{option.label}</strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Caja / punto de cobro"
                  description="Indica donde se resuelve normalmente el cobro."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Caja o punto de cobro">
                  {SERVICE_CASHIER_OPTIONS.map((option) => {
                    const selected = serviceElementsAnswers.cashier === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectServiceAnswer("cashier", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                          <span className="hostly-rooms-space-card__icon">
                            <Icon className="hostly-icon-lg" aria-hidden />
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Recepcion / bienvenida"
                  description="Marca donde se recibe al cliente al llegar."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Recepcion o bienvenida">
                  {SERVICE_RECEPTION_OPTIONS.map((option) => {
                    const selected = serviceElementsAnswers.reception === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectServiceAnswer("reception", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                          <span className="hostly-rooms-space-card__icon">
                            <Icon className="hostly-icon-lg" aria-hidden />
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Estacion de camareros"
                  description="Indica la base operativa principal del equipo de sala."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Estacion de camareros">
                  {SERVICE_WAITER_STATION_OPTIONS.map((option) => {
                    const selected = serviceElementsAnswers.waiterStation === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectServiceAnswer("waiterStation", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                          <span className="hostly-rooms-space-card__icon">
                            <Icon className="hostly-icon-lg" aria-hidden />
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <HostlySectionHeader
                  title="Pase / punto de recogida"
                  description="Marca desde donde sale normalmente la recogida de platos o bebidas."
                  className="hostly-rooms-step__heading"
                />
                <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Pase o punto de recogida">
                  {SERVICE_PICKUP_OPTIONS.map((option) => {
                    const selected = serviceElementsAnswers.pickup === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="hostly-rooms-question-option"
                        onClick={() => selectServiceAnswer("pickup", option.id)}
                      >
                        <HostlySurface
                          variant={selected ? "elevated" : "flat"}
                          interactive
                          className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                        >
                          <span className="hostly-rooms-question-card__copy">
                            <strong className="hostly-type-card-title">{option.label}</strong>
                            <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                              {option.description}
                            </span>
                          </span>
                          <span className="hostly-rooms-space-card__icon">
                            <Icon className="hostly-icon-lg" aria-hidden />
                          </span>
                        </HostlySurface>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-4">
              <HostlySectionHeader
                title="Zona de espera"
                description="Indica donde suele acumularse la espera si existe."
                className="hostly-rooms-step__heading"
              />
              <div className="hostly-rooms-question-grid" role="radiogroup" aria-label="Zona de espera">
                {SERVICE_WAITING_ZONE_OPTIONS.map((option) => {
                  const selected = serviceElementsAnswers.waitingZone === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectServiceAnswer("waitingZone", option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                      >
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">{option.label}</strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span className="hostly-rooms-space-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="ghost"
              className="hostly-rooms-step-nav__button"
              onClick={() => setStep("elements-summary")}
            >
              Atras
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              disabled={!serviceStepComplete}
              onClick={() => setStep("service-summary")}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "service-summary") {
    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={6} />
          <StructureStageRail activeStep={6} />

          <HostlySurface variant="elevated" className="hostly-rooms-elements-summary">
            <span className="hostly-rooms-elements-summary__icon">
              <Check className="hostly-icon-xl" aria-hidden />
            </span>
            <p className="hostly-rooms-eyebrow hostly-type-caption">
              Hostly ya conoce los puntos de servicio
            </p>
            <h1 className="hostly-type-page-title">
              {firstSpace?.label ?? "Primer espacio"}
            </h1>
            <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
              La barra, la caja y las zonas de trabajo ya tienen un contexto base para futuras propuestas.
            </p>

            <div className="hostly-rooms-elements-summary__content">
              <div>
                <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                  Servicio
                </span>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    Barra: {getOptionLabel(SERVICE_BAR_OPTIONS, serviceElementsAnswers.bar)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Caja: {getOptionLabel(SERVICE_CASHIER_OPTIONS, serviceElementsAnswers.cashier)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Recepcion: {getOptionLabel(SERVICE_RECEPTION_OPTIONS, serviceElementsAnswers.reception)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Estacion: {getOptionLabel(SERVICE_WAITER_STATION_OPTIONS, serviceElementsAnswers.waiterStation)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Pase: {getOptionLabel(SERVICE_PICKUP_OPTIONS, serviceElementsAnswers.pickup)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Espera: {getOptionLabel(SERVICE_WAITING_ZONE_OPTIONS, serviceElementsAnswers.waitingZone)}
                  </span>
                </div>
              </div>
            </div>
          </HostlySurface>

          {phaseSixComplete ? (
            <HostlyAlert tone="success" title="Puntos de servicio preparados">
              El contexto operativo sigue solo en esta sesion. Todavia no se ha creado ningun plano ni persistencia nueva.
            </HostlyAlert>
          ) : null}

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="secondary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setPhaseSixComplete(false);
                setStep("service");
              }}
            >
              Editar servicio
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setPhaseSixComplete(true);
                setTableQuestion(0);
                setStep("tables");
              }}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "tables") {
    const tableQuestionComplete = tableQuestion >= tableQuestionKeys.length;
    const tableQuestionMeta = (() => {
      switch (currentTableQuestionKey) {
        case "approximateCount":
          return {
            title: "¿Cuántas mesas aproximadas tienes?",
            description:
              "No hace falta ser exacto. Solo necesitamos una idea general para preparar el plano.",
            options: TABLE_COUNT_OPTIONS,
            ariaLabel: "Número aproximado de mesas",
          };
        case "sizeDistribution":
          return {
            title: "¿Cómo se reparten los tamaños?",
            description:
              "Indica qué tipo de mesa predomina en tu sala.",
            options: TABLE_SIZE_OPTIONS,
            ariaLabel: "Distribución por tamaños",
          };
        case "highTables":
          return {
            title: "¿Tienes mesas altas?",
            description:
              "Mesas altas, taburetes o zona de consumo en altura.",
            options: HIGH_TABLES_OPTIONS,
            ariaLabel: "Mesas altas",
          };
        case "barSeating":
          return {
            title: "¿Cuántos sitios hay en barra?",
            description:
              "La barra condiciona la circulación y el servicio de bebidas.",
            options: BAR_SEATING_OPTIONS,
            ariaLabel: "Sitios en barra",
          };
        case "terraceTables":
          return {
            title: "¿Cuántas mesas hay en terraza?",
            description:
              "Así podremos reservar la terraza con el peso operativo correcto.",
            options: TERRACE_TABLES_OPTIONS,
            ariaLabel: "Mesas en terraza",
          };
        case "outdoorTables":
          return {
            title: "¿Cuántas mesas exteriores tienes?",
            description:
              "Jardín, playa, azotea u otras zonas al aire libre.",
            options: OUTDOOR_TABLES_OPTIONS,
            ariaLabel: "Mesas exteriores",
          };
        default:
          return null;
      }
    })();

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={7} />
          <StructureStageRail activeStep={7} />

          {tableQuestionComplete ? (
            <>
              <HostlySurface variant="elevated" className="hostly-rooms-structure-complete">
                <span className="hostly-rooms-structure-complete__icon">
                  <Utensils className="hostly-icon-xl" aria-hidden />
                </span>
                <p className="hostly-rooms-eyebrow hostly-type-caption">
                  Mesas definidas
                </p>
                <h1 className="hostly-type-page-title">
                  Ya tenemos una idea clara de tu capacidad
                </h1>
                <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                  Hostly usará esta información para proponer un plano inicial con mesas,
                  barra y zonas exteriores.
                </p>
              </HostlySurface>
              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() =>
                    setTableQuestion(Math.max(0, tableQuestionKeys.length - 1))
                  }
                >
                  Revisar respuestas
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => setStep("tables-summary")}
                >
                  Continuar
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          ) : tableQuestionMeta ? (
            <>
              <HostlySurface variant="ice" className="hostly-rooms-ambience-hero">
                <span className="hostly-rooms-ambience-hero__icon">
                  <Utensils className="hostly-icon-lg" aria-hidden />
                </span>
                <div>
                  <p className="hostly-rooms-eyebrow hostly-type-caption">
                    Mesas · pregunta {tableQuestion + 1} de {tableQuestionKeys.length}
                  </p>
                  <h1 className="hostly-type-section-title">{tableQuestionMeta.title}</h1>
                  <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                    {tableQuestionMeta.description}
                  </p>
                </div>
              </HostlySurface>

              <div
                className="hostly-rooms-question-grid"
                role="radiogroup"
                aria-label={tableQuestionMeta.ariaLabel}
              >
                {tableQuestionMeta.options.map((option) => {
                  const selected = currentTableAnswer === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectTableAnswer(option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card ${selected ? "is-selected" : ""}`}
                      >
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">{option.label}</strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span className="hostly-rooms-question-card__icon">
                          <Icon className="hostly-icon-lg" aria-hidden />
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>

              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => {
                    if (tableQuestion === 0) {
                      setStep("service-summary");
                      return;
                    }
                    setTableQuestion((current) => current - 1);
                  }}
                >
                  Atrás
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  disabled={!currentTableAnswer}
                  onClick={() => setTableQuestion((current) => current + 1)}
                >
                  Continuar
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          ) : null}
        </main>
      </div>
    );
  }

  if (step === "tables-summary") {
    const estimatedTables = estimateTableCount({
      ...tablesAnswers,
      terraceTables: hasTerraceSpace ? tablesAnswers.terraceTables : "none",
      outdoorTables: hasOutdoorSpaces ? tablesAnswers.outdoorTables : "none",
    });

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={7} />
          <StructureStageRail activeStep={7} />

          <HostlySurface variant="elevated" className="hostly-rooms-elements-summary">
            <span className="hostly-rooms-elements-summary__icon">
              <Check className="hostly-icon-xl" aria-hidden />
            </span>
            <p className="hostly-rooms-eyebrow hostly-type-caption">
              Capacidad estimada · ~{estimatedTables} mesas
            </p>
            <h1 className="hostly-type-page-title">Así quedarán tus mesas</h1>
            <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
              Revisa la propuesta antes del resumen final del restaurante.
            </p>

            <div className="hostly-rooms-elements-summary__content">
              <div className="hostly-rooms-summary__spaces">
                <span className="hostly-rooms-summary-chip">
                  Total:{" "}
                  {getOptionLabel(TABLE_COUNT_OPTIONS, tablesAnswers.approximateCount)}
                </span>
                <span className="hostly-rooms-summary-chip">
                  Tamaños:{" "}
                  {getOptionLabel(TABLE_SIZE_OPTIONS, tablesAnswers.sizeDistribution)}
                </span>
                <span className="hostly-rooms-summary-chip">
                  Altas: {getOptionLabel(HIGH_TABLES_OPTIONS, tablesAnswers.highTables)}
                </span>
                <span className="hostly-rooms-summary-chip">
                  Barra: {getOptionLabel(BAR_SEATING_OPTIONS, tablesAnswers.barSeating)}
                </span>
                {hasTerraceSpace ? (
                  <span className="hostly-rooms-summary-chip">
                    Terraza:{" "}
                    {getOptionLabel(TERRACE_TABLES_OPTIONS, tablesAnswers.terraceTables)}
                  </span>
                ) : null}
                {hasOutdoorSpaces ? (
                  <span className="hostly-rooms-summary-chip">
                    Exterior:{" "}
                    {getOptionLabel(OUTDOOR_TABLES_OPTIONS, tablesAnswers.outdoorTables)}
                  </span>
                ) : null}
              </div>
            </div>
          </HostlySurface>

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="secondary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setTableQuestion(0);
                setStep("tables");
              }}
            >
              Editar mesas
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              onClick={() => {
                setPhaseSevenComplete(true);
                setStep("final-summary");
              }}
            >
              Continuar
              <ArrowRight className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "final-summary") {
    const estimatedTables = estimateTableCount({
      ...tablesAnswers,
      terraceTables: hasTerraceSpace ? tablesAnswers.terraceTables : "none",
      outdoorTables: hasOutdoorSpaces ? tablesAnswers.outdoorTables : "none",
    });
    const shapeLabel = SHAPE_OPTIONS.find(
      (option) => option.id === structureAnswers.shape,
    )?.label;
    const materialLabel = FLOOR_MATERIAL_OPTIONS.find(
      (option) => option.id === ambienceAnswers.material,
    )?.label;
    const ambienceLabel = AMBIENCE_OPTIONS.find(
      (option) => option.id === ambienceAnswers.ambience,
    )?.label;

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={8} />
          <StructureStageRail activeStep={8} />

          <HostlySurface variant="elevated" className="hostly-rooms-final-summary">
            <div className="hostly-rooms-final-summary__hero">
              <span className="hostly-rooms-final-summary__icon">
                <Sparkles className="hostly-icon-xl" aria-hidden />
              </span>
              <div>
                <p className="hostly-rooms-eyebrow hostly-type-caption">
                  Todo listo para generar
                </p>
                <h1 className="hostly-type-page-title">
                  Tu restaurante ya tiene forma
                </h1>
                <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                  Revisa el conjunto antes de crear el plano inicial. Podrás ajustar
                  cualquier detalle después en el editor.
                </p>
              </div>
            </div>

            <div className="hostly-rooms-final-summary__grid">
              <section className="hostly-rooms-final-summary__card">
                <span className="hostly-rooms-final-summary__card-icon">
                  {business ? <business.icon className="hostly-icon-lg" /> : null}
                </span>
                <h2 className="hostly-type-card-title">Espacios</h2>
                <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                  {business?.label ?? "Negocio"} · {selectedSpaceOptions.length} zonas
                </p>
                <div className="hostly-rooms-summary__spaces">
                  {selectedSpaceOptions.map((space) => (
                    <span key={space.id} className="hostly-rooms-summary-chip">
                      {space.label}
                    </span>
                  ))}
                </div>
              </section>

              <section className="hostly-rooms-final-summary__card">
                <span className="hostly-rooms-final-summary__card-icon">
                  <PanelsTopLeft className="hostly-icon-lg" aria-hidden />
                </span>
                <h2 className="hostly-type-card-title">Estructura</h2>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    Forma: {shapeLabel ?? "Sin indicar"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Barra integrada: {structureAnswers.hasBar === "yes" ? "Sí" : "No"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Terraza conectada:{" "}
                    {structureAnswers.connectedTerrace === "yes" ? "Sí" : "No"}
                  </span>
                </div>
              </section>

              <section className="hostly-rooms-final-summary__card">
                <span className="hostly-rooms-final-summary__card-icon">
                  <Palette className="hostly-icon-lg" aria-hidden />
                </span>
                <h2 className="hostly-type-card-title">Ambiente</h2>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    Suelo: {materialLabel ?? "Sin indicar"}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Estilo: {ambienceLabel ?? "Sin indicar"}
                  </span>
                </div>
              </section>

              <section className="hostly-rooms-final-summary__card">
                <span className="hostly-rooms-final-summary__card-icon">
                  <DoorOpen className="hostly-icon-lg" aria-hidden />
                </span>
                <h2 className="hostly-type-card-title">Elementos</h2>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    Puertas: {selectedDoorOptions.length}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Ventanas:{" "}
                    {getOptionLabel(WINDOWS_OPTIONS, structuralElementsAnswers.windows)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Obstáculos: {selectedObstacleOptions.length}
                  </span>
                </div>
              </section>

              <section className="hostly-rooms-final-summary__card">
                <span className="hostly-rooms-final-summary__card-icon">
                  <GlassWater className="hostly-icon-lg" aria-hidden />
                </span>
                <h2 className="hostly-type-card-title">Servicio</h2>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    Barra: {getOptionLabel(SERVICE_BAR_OPTIONS, serviceElementsAnswers.bar)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Caja:{" "}
                    {getOptionLabel(SERVICE_CASHIER_OPTIONS, serviceElementsAnswers.cashier)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Pase: {getOptionLabel(SERVICE_PICKUP_OPTIONS, serviceElementsAnswers.pickup)}
                  </span>
                </div>
              </section>

              <section className="hostly-rooms-final-summary__card hostly-rooms-final-summary__card--highlight">
                <span className="hostly-rooms-final-summary__card-icon">
                  <Utensils className="hostly-icon-lg" aria-hidden />
                </span>
                <h2 className="hostly-type-card-title">Mesas</h2>
                <p className="hostly-type-section-title text-[var(--hostly-accent)]">
                  ~{estimatedTables} mesas estimadas
                </p>
                <div className="hostly-rooms-summary__spaces">
                  <span className="hostly-rooms-summary-chip">
                    {getOptionLabel(TABLE_SIZE_OPTIONS, tablesAnswers.sizeDistribution)}
                  </span>
                  <span className="hostly-rooms-summary-chip">
                    Barra: {getOptionLabel(BAR_SEATING_OPTIONS, tablesAnswers.barSeating)}
                  </span>
                </div>
              </section>
            </div>
          </HostlySurface>

          {phaseSevenComplete ? (
            <HostlyAlert tone="success" title="Configuración completa">
              Hostly puede generar ahora un plano inicial con todo lo que has definido.
            </HostlyAlert>
          ) : null}

          <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HostlyButton
              variant="secondary"
              className="hostly-rooms-step-nav__button"
              onClick={() => setStep("tables-summary")}
            >
              Editar mesas
            </HostlyButton>
            <HostlyButton
              variant="primary"
              className="hostly-rooms-step-nav__button"
              onClick={startPlanGeneration}
            >
              Generar plano
              <Sparkles className="hostly-icon-sm" aria-hidden />
            </HostlyButton>
          </div>
        </main>
      </div>
    );
  }

  if (step === "generating") {
    const progressPercent =
      (Math.min(generationProgressIndex, GENERATION_PROGRESS_MESSAGES.length) /
        GENERATION_PROGRESS_MESSAGES.length) *
      100;
    const currentMessage =
      GENERATION_PROGRESS_MESSAGES[
        Math.min(generationProgressIndex, GENERATION_PROGRESS_MESSAGES.length - 1)
      ];

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Estamos preparando tu plano inicial."
        />

        <main className="hostly-rooms-generation mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-[var(--hostly-page-pad-x)] py-8 sm:py-12">
          <HostlySurface variant="elevated" className="hostly-rooms-generation__panel">
            <span className="hostly-rooms-generation__icon">
              <LayoutDashboard className="hostly-icon-xl" aria-hidden />
            </span>
            <h1 className="hostly-type-page-title text-center">
              Creando tu sala
            </h1>
            <p
              className="hostly-rooms-generation__message hostly-type-section-title text-center text-[var(--hostly-accent)]"
              aria-live="polite"
            >
              {currentMessage}
            </p>
            <div
              className="hostly-rooms-generation__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPercent)}
            >
              <span
                className="hostly-rooms-generation__value"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <ul className="hostly-rooms-generation__steps">
              {GENERATION_PROGRESS_MESSAGES.map((message, index) => {
                const done = index < generationProgressIndex;
                const active = index === generationProgressIndex;
                return (
                  <li
                    key={message}
                    className={`hostly-rooms-generation__step ${
                      done ? "is-done" : active ? "is-active" : ""
                    }`}
                  >
                    <span className="hostly-rooms-generation__step-dot" aria-hidden>
                      {done ? <Check className="hostly-icon-sm" /> : null}
                    </span>
                    <span className="hostly-type-caption">{message}</span>
                  </li>
                );
              })}
            </ul>
          </HostlySurface>
        </main>
      </div>
    );
  }

  if (step === "ready") {
    const draft = assistantDraft ?? buildCurrentDraft();
    const estimatedTables = draft?.generatedPlan.estimatedTableCount ?? 0;

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Tu plano inicial está preparado."
        />

        <main className="hostly-rooms-ready mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-[var(--hostly-page-pad-x)] py-6 sm:py-10">
          <HostlySurface variant="ice" className="hostly-rooms-ready__panel">
            <span className="hostly-rooms-ready__icon">
              <Check className="hostly-icon-xl" aria-hidden />
            </span>
            <p className="hostly-rooms-eyebrow hostly-type-caption text-center">
              Fase 1 completada
            </p>
            <h1 className="hostly-type-page-title text-center">
              Tu restaurante ya está listo
            </h1>
            <p className="hostly-type-body text-center text-[var(--hostly-ink-muted)]">
              Hemos preparado un plano inicial con aproximadamente {estimatedTables} mesas
              repartidas en {selectedSpaceOptions.length} espacios. La siguiente fase abrirá
              el editor visual sobre este borrador.
            </p>

            <div className="hostly-rooms-ready__actions">
              <HostlyButton
                variant="primary"
                className="hostly-rooms-step-nav__button"
                onClick={openEditorWithDraft}
              >
                Abrir editor visual
                <ArrowRight className="hostly-icon-sm" aria-hidden />
              </HostlyButton>
              <HostlyButton
                variant="secondary"
                className="hostly-rooms-step-nav__button"
                onClick={() => setStep("final-summary")}
              >
                Revisar configuración
              </HostlyButton>
            </div>
          </HostlySurface>

          <HostlyAlert tone="success" title="Borrador preparado para el editor">
            El plano es un borrador. Revísalo en el editor y pulsa Publicar plano para que
            el TPV lo use.
          </HostlyAlert>
        </main>
      </div>
    );
  }

  if (step === "ambience") {
    const ambienceComplete = ambienceQuestion >= 5;
    const questionTitle =
      ambienceQuestion === 0
        ? "¿Qué tipo de suelo tiene este espacio?"
        : ambienceQuestion === 1
          ? "¿Qué tono predomina?"
          : ambienceQuestion === 2
            ? "¿Todo el espacio tiene el mismo suelo?"
            : ambienceQuestion === 3
              ? "¿Existe algún cambio de nivel?"
              : "¿Qué ambiente describe mejor este espacio?";
    const questionHelp =
      ambienceQuestion === 0
        ? "El material nos ayudará a representar el espacio de una forma más reconocible."
        : ambienceQuestion === 1
          ? "Solo necesitamos una impresión general. Podrás precisar el color más adelante."
          : ambienceQuestion === 2
            ? "Así sabremos si debemos pensar en una superficie continua o en varias áreas."
            : ambienceQuestion === 3
              ? "Los cambios de altura condicionan la lectura y la circulación del espacio."
              : "El ambiente orientará futuras sugerencias visuales, colores e iconografía.";
    const binaryOptions = [
      { id: "yes", label: "Sí", description: "Mantiene una sola superficie." },
      { id: "no", label: "No", description: "Combina más de un acabado." },
    ];
    const ambienceOptions: Array<{
      id: string;
      label: string;
      description: string;
      icon?: LucideIcon;
    }> =
      ambienceQuestion === 0
        ? FLOOR_MATERIAL_OPTIONS
        : ambienceQuestion === 1
          ? FLOOR_TONE_OPTIONS
          : ambienceQuestion === 2
            ? binaryOptions
            : ambienceQuestion === 3
              ? LEVEL_OPTIONS
              : AMBIENCE_OPTIONS;

    return (
      <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
        <HostlyPageHeader
          wide
          compactSpacing
          title="Asistente de Salas"
          subtitle="Vamos a preparar tu restaurante paso a paso."
        />

        <main className="hostly-rooms-structure mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
          <Progress step={4} />
          <StructureStageRail activeStep={4} />

          {ambienceComplete ? (
            <>
              <HostlySurface
                variant="elevated"
                className="hostly-rooms-structure-complete"
              >
                <span className="hostly-rooms-ambience-complete__icon">
                  <Palette className="hostly-icon-xl" aria-hidden />
                </span>
                <p className="hostly-rooms-eyebrow hostly-type-caption">
                  Ambiente definido
                </p>
                <h1 className="hostly-type-page-title">
                  Ya podemos imaginar mejor {firstSpace?.label ?? "este espacio"}.
                </h1>
                <p className="hostly-type-body text-[var(--hostly-ink-muted)]">
                  Hostly conoce ahora el suelo, el tono, los niveles y el estilo
                  general. No se ha dibujado ni guardado ningún elemento.
                </p>
              </HostlySurface>
              <HostlyAlert tone="success" title="Decisiones guardadas en esta sesión">
                Este contexto queda preparado para futuras sugerencias visuales y
                para la generación asistida del espacio.
              </HostlyAlert>
              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="secondary"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => setAmbienceQuestion(4)}
                >
                  Revisar respuestas
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  onClick={openElementsPhase}
                >
                  Siguiente fase
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          ) : (
            <>
              <HostlySurface variant="ice" className="hostly-rooms-ambience-hero">
                <span className="hostly-rooms-ambience-hero__icon">
                  <Palette className="hostly-icon-lg" aria-hidden />
                </span>
                <div>
                  <p className="hostly-rooms-eyebrow hostly-type-caption">
                    Suelo y ambiente
                  </p>
                  <h1 className="hostly-type-section-title">
                    Ahora vamos a definir el aspecto general de este espacio
                  </h1>
                  <p className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                    Esto permitirá que Hostly prepare después una propuesta más
                    realista y fácil de entender.
                  </p>
                </div>
              </HostlySurface>

              <HostlySectionHeader
                title={questionTitle}
                description={questionHelp}
                className="hostly-rooms-step__heading"
              />

              <div
                className={`hostly-rooms-question-grid hostly-rooms-ambience-grid is-question-${ambienceQuestion}`}
                role="radiogroup"
                aria-label={questionTitle}
              >
                {ambienceOptions.map((option) => {
                  const selected = currentAmbienceAnswer === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="hostly-rooms-question-option"
                      onClick={() => selectAmbienceAnswer(option.id)}
                    >
                      <HostlySurface
                        variant={selected ? "elevated" : "flat"}
                        interactive
                        className={`hostly-rooms-question-card hostly-rooms-ambience-card ${
                          selected ? "is-selected" : ""
                        }`}
                      >
                        {Icon ? (
                          <span
                            className={`hostly-rooms-question-card__icon hostly-rooms-ambience-swatch is-${option.id}`}
                          >
                            <Icon className="hostly-icon-lg" aria-hidden />
                          </span>
                        ) : null}
                        <span className="hostly-rooms-question-card__copy">
                          <strong className="hostly-type-card-title">
                            {option.label}
                          </strong>
                          <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                            {option.description}
                          </span>
                        </span>
                        <span
                          className={`hostly-rooms-space-check ${
                            selected ? "is-selected" : ""
                          }`}
                          aria-hidden
                        >
                          {selected ? <Check className="hostly-icon-sm" /> : null}
                        </span>
                      </HostlySurface>
                    </button>
                  );
                })}
              </div>

              {ambienceQuestion === 2 &&
              ambienceAnswers.uniformFloor === "no" ? (
                <HostlyAlert tone="info" title="Podrás detallarlo después">
                  Más adelante podrás dividir este espacio en varias superficies.
                </HostlyAlert>
              ) : null}

              <p className="hostly-rooms-question-count hostly-type-caption">
                Pregunta {ambienceQuestion + 1} de 5 · Solo guardamos una impresión
                general
              </p>

              <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <HostlyButton
                  variant="ghost"
                  className="hostly-rooms-step-nav__button"
                  onClick={() => {
                    if (ambienceQuestion === 0) {
                      setStep("structure");
                      setStructureQuestion(4);
                    } else {
                      setAmbienceQuestion((current) => current - 1);
                    }
                  }}
                >
                  Atrás
                </HostlyButton>
                <HostlyButton
                  variant="primary"
                  className="hostly-rooms-step-nav__button"
                  disabled={!currentAmbienceAnswer}
                  onClick={() =>
                    setAmbienceQuestion((current) => current + 1)
                  }
                >
                  Continuar
                  <ArrowRight className="hostly-icon-sm" aria-hidden />
                </HostlyButton>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  const currentStep = step === "business" ? 1 : 2;

  return (
    <div className="hostly-rooms-onboarding hostly-rooms-onboarding--step flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--hostly-surface-page)]">
      <HostlyPageHeader
        wide
        compactSpacing
        title="Asistente de Salas"
        subtitle="Vamos a preparar tu restaurante paso a paso."
      />

      <main className="hostly-rooms-step mx-auto flex w-full max-w-6xl flex-1 flex-col px-[var(--hostly-page-pad-x)] py-5 sm:py-8">
        <Progress step={currentStep} />

        {step === "business" ? (
          <>
            <HostlySectionHeader
              title="¿Qué tipo de negocio tienes?"
              description="Así podremos recomendarte espacios, elementos y distribuciones que tengan sentido para tu operación."
              className="hostly-rooms-step__heading"
            />

            <div
              className="hostly-rooms-business-grid grid sm:grid-cols-2 lg:grid-cols-3"
              role="radiogroup"
              aria-label="Tipo de negocio"
            >
              {BUSINESS_TYPES.map((option) => {
                const selected = businessType === option.id;
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="hostly-rooms-business-option text-left"
                    onClick={() => chooseBusiness(option.id)}
                  >
                    <HostlySurface
                      variant={selected ? "elevated" : "flat"}
                      interactive
                      className={`hostly-rooms-business-card flex h-full items-start ${
                        selected
                          ? "hostly-rooms-business-card--selected border-[var(--hostly-accent)] bg-[var(--hostly-accent-soft)]"
                          : ""
                      }`}
                    >
                      <span className="hostly-rooms-business-card__icon flex shrink-0 items-center justify-center rounded-xl bg-[var(--hostly-ice-100)] text-[var(--hostly-ink)]">
                        <Icon className="hostly-icon-xl" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="hostly-type-card-title text-[var(--hostly-ink-strong)]">
                            {option.label}
                          </span>
                          {selected ? (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--hostly-accent)] text-white">
                              <Check className="hostly-icon-sm" aria-hidden />
                            </span>
                          ) : null}
                        </span>
                        <span className="hostly-type-caption mt-2 block text-[var(--hostly-ink-muted)]">
                          {option.description}
                        </span>
                      </span>
                    </HostlySurface>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <HostlySectionHeader
              title="¿Qué espacios tiene tu negocio?"
              description={`${business?.label ?? "Tu negocio"} suele funcionar bien con esta propuesta. Selecciona todos los espacios que necesites.`}
              className="hostly-rooms-step__heading"
            />

            <div
              className="hostly-rooms-spaces-grid"
              role="group"
              aria-label="Espacios del negocio"
            >
              {SPACE_OPTIONS.map((space) => {
                const selected = selectedSpaces.includes(space.id);
                const recommended = recommendedSpaceIds.includes(space.id);
                const Icon = space.icon;

                return (
                  <button
                    key={space.id}
                    type="button"
                    aria-pressed={selected}
                    className="hostly-rooms-space-option"
                    onClick={() => toggleSpace(space.id)}
                  >
                    <HostlySurface
                      variant={selected ? "elevated" : "flat"}
                      interactive
                      className={`hostly-rooms-space-card ${
                        selected ? "hostly-rooms-space-card--selected" : ""
                      }`}
                    >
                      <span className="hostly-rooms-space-card__icon">
                        <Icon className="hostly-icon-lg" aria-hidden />
                      </span>
                      <span className="hostly-rooms-space-card__copy">
                        <span className="hostly-rooms-space-card__title">
                          <span className="hostly-type-card-title">
                            {space.label}
                          </span>
                          {recommended ? (
                            <span className="hostly-rooms-recommended-badge">
                              Recomendado
                            </span>
                          ) : null}
                        </span>
                        <span className="hostly-type-caption text-[var(--hostly-ink-muted)]">
                          {space.description}
                        </span>
                      </span>
                      <span
                        className={`hostly-rooms-space-check ${
                          selected ? "is-selected" : ""
                        }`}
                        aria-hidden
                      >
                        {selected ? <Check className="hostly-icon-sm" /> : null}
                      </span>
                    </HostlySurface>
                  </button>
                );
              })}
            </div>

            {selectedSpaces.length === 0 ? (
              <HostlyAlert tone="neutral" title="Selecciona al menos un espacio">
                Puedes empezar por el espacio principal y añadir los demás más
                adelante.
              </HostlyAlert>
            ) : (
              <p className="hostly-rooms-selection-count hostly-type-caption">
                {selectedSpaces.length}{" "}
                {selectedSpaces.length === 1
                  ? "espacio seleccionado"
                  : "espacios seleccionados"}
              </p>
            )}
          </>
        )}

        <div className="hostly-rooms-step-nav mt-auto flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <HostlyButton
            variant="ghost"
            className="hostly-rooms-step-nav__button"
            onClick={() => {
              if (step === "spaces") {
                setStep("business");
              } else {
                setStarted(false);
              }
            }}
          >
            Atrás
          </HostlyButton>
          <HostlyButton
            variant="primary"
            className="hostly-rooms-step-nav__button"
            disabled={
              step === "business" ? !businessType : selectedSpaces.length === 0
            }
            onClick={() =>
              setStep(step === "business" ? "spaces" : "summary")
            }
          >
            Continuar
            <ArrowRight className="hostly-icon-sm" aria-hidden />
          </HostlyButton>
        </div>
      </main>
    </div>
  );
}
