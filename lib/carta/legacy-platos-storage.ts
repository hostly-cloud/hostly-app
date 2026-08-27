import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
  type PlatoCarta,
  type TipoProductoVenta,
} from "@/lib/carta/product-sale-contract";

export const PLATOS_LOCAL_STORAGE_KEY = "hostly.platos.v1";
export const PLATOS_CHANGED_EVENT = "hostly-platos-changed";

type RootStore = Record<string, PlatoCarta[]>;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readRoot(): RootStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLATOS_LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RootStore;
  } catch {
    return {};
  }
}

function writeRoot(root: RootStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLATOS_LOCAL_STORAGE_KEY, JSON.stringify(root));
    window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function loadPlatos(restauranteId: string): PlatoCarta[] {
  const root = readRoot();
  const list = root[restauranteId];
  if (!Array.isArray(list)) return [];
  return list.map((raw: unknown) => {
    const p = raw as PlatoCarta;
    const inferredTieneEsc = p?.escandalloSupabaseId != null;
    const cat = typeof p?.categoria === "string" ? p.categoria.trim() : "";
    const nom = typeof p?.nombre === "string" ? p.nombre.trim() : "";
    return {
      ...p,
      tipoVenta:
        parseTipoVentaLoose(p?.tipoVenta) ?? inferTipoVentaFromCartaText(cat || "General", nom),
      tieneEscandallo:
        typeof p?.tieneEscandallo === "boolean" ? p.tieneEscandallo : inferredTieneEsc,
      estadoCoste:
        p?.estadoCoste === "ok" || p?.estadoCoste === "pendiente"
          ? p.estadoCoste
          : inferredTieneEsc
            ? "ok"
            : "pendiente",
      origenAlta:
        p?.origenAlta === "importacion_ia" || p?.origenAlta === "manual"
          ? p.origenAlta
          : "manual",
    };
  });
}

export function savePlatos(restauranteId: string, platos: PlatoCarta[]): void {
  const root = readRoot();
  root[restauranteId] = platos;
  writeRoot(root);
}

export function newPlatoId(): string {
  return newId();
}

export function createPlatoDraft(
  restauranteId: string,
  partial: Partial<
    Pick<
      PlatoCarta,
      | "nombre"
      | "preparationArea"
      | "tipoVenta"
      | "categoria"
      | "categoriaCartaId"
      | "cartaFamiliaId"
      | "ordenEnCategoria"
      | "precioVenta"
      | "activo"
      | "fotoUrl"
      | "descripcion"
    >
  >,
): PlatoCarta {
  const now = new Date().toISOString();
  const cat = (partial.categoria != null ? partial.categoria : "").trim();
  const nom = (partial.nombre ?? "").trim();
  const tipoVenta: TipoProductoVenta =
    parseTipoVentaLoose(partial.tipoVenta) ?? inferTipoVentaFromCartaText(cat || "General", nom);
  return {
    id: newId(),
    restauranteId,
    nombre: (partial.nombre ?? "").trim(),
    preparationArea: partial.preparationArea?.trim() || undefined,
    tipoVenta,
    categoria: (partial.categoria != null ? partial.categoria : "").trim(),
    categoriaCartaId: partial.categoriaCartaId?.trim() || undefined,
    cartaFamiliaId: partial.cartaFamiliaId?.trim() || undefined,
    ordenEnCategoria:
      typeof partial.ordenEnCategoria === "number" && Number.isFinite(partial.ordenEnCategoria)
        ? partial.ordenEnCategoria
        : undefined,
    precioVenta:
      typeof partial.precioVenta === "number" && Number.isFinite(partial.precioVenta)
        ? Math.max(0, partial.precioVenta)
        : 0,
    activo: partial.activo !== false,
    fotoUrl: partial.fotoUrl?.trim() || undefined,
    descripcion: partial.descripcion?.trim() || undefined,
    tieneEscandallo: false,
    estadoCoste: "pendiente",
    origenAlta: "manual",
    escandalloSupabaseId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function syncPlatoPrecioFromEscandalloSave(
  restauranteId: string,
  escandalloSupabaseId: number,
  precioVenta: number | null,
): void {
  if (precioVenta == null || !Number.isFinite(precioVenta)) return;
  const platos = loadPlatos(restauranteId);
  const idx = platos.findIndex((p) => p.escandalloSupabaseId === escandalloSupabaseId);
  if (idx < 0) return;
  const p = platos[idx];
  if (p.precioVenta === precioVenta) return;
  const next = [...platos];
  next[idx] = { ...p, precioVenta, updatedAt: new Date().toISOString() };
  savePlatos(restauranteId, next);
}

export function setPlatoEscandalloId(
  restauranteId: string,
  platoId: string,
  escandalloSupabaseId: number | null,
): void {
  const platos = loadPlatos(restauranteId);
  const idx = platos.findIndex((p) => p.id === platoId);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const next = [...platos];
  next[idx] = { ...next[idx], escandalloSupabaseId, updatedAt: now };
  savePlatos(restauranteId, next);
}
