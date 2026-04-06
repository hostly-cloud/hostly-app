/**
 * Persistencia local del módulo Usuarios (TPV / demo hasta auth real).
 */

export const USUARIOS_LOCAL_STORAGE_KEY = "hostly.usuarios.equipo.v1";

export const USUARIO_ROLES = ["admin", "encargado", "operativo"] as const;
export type UsuarioRol = (typeof USUARIO_ROLES)[number];

export const USUARIO_MODULOS = ["stock", "compras", "mermas", "escandallos"] as const;
export type UsuarioModulo = (typeof USUARIO_MODULOS)[number];

export type UsuarioModulos = Record<UsuarioModulo, boolean>;

export type UsuarioLocal = {
  id: string;
  nombre: string;
  email: string;
  rol: UsuarioRol;
  activo: boolean;
  modulos: UsuarioModulos;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `usr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultModulos(): UsuarioModulos {
  return { stock: true, compras: true, mermas: true, escandallos: true };
}

const SEED: UsuarioLocal[] = [
  {
    id: "seed-admin",
    nombre: "Ana García",
    email: "ana@restaurante.local",
    rol: "admin",
    activo: true,
    modulos: defaultModulos(),
  },
  {
    id: "seed-enc",
    nombre: "Carlos Ruiz",
    email: "carlos@restaurante.local",
    rol: "encargado",
    activo: true,
    modulos: defaultModulos(),
  },
  {
    id: "seed-op1",
    nombre: "Laura Méndez",
    email: "laura@restaurante.local",
    rol: "operativo",
    activo: true,
    modulos: { stock: true, compras: false, mermas: true, escandallos: false },
  },
  {
    id: "seed-op2",
    nombre: "Marcos Díaz",
    email: "marcos@restaurante.local",
    rol: "operativo",
    activo: false,
    modulos: { stock: true, compras: false, mermas: false, escandallos: false },
  },
];

function isRol(v: unknown): v is UsuarioRol {
  return typeof v === "string" && (USUARIO_ROLES as readonly string[]).includes(v);
}

function parseModulos(raw: unknown): UsuarioModulos {
  const base = defaultModulos();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const k of USUARIO_MODULOS) {
    base[k] = o[k] === true;
  }
  return base;
}

export function defaultModulosForRol(rol: UsuarioRol): UsuarioModulos {
  if (rol === "admin" || rol === "encargado") return defaultModulos();
  return { stock: true, compras: false, mermas: true, escandallos: false };
}

export function newUsuarioId(): string {
  return newId();
}

export function loadUsuarios(): UsuarioLocal[] {
  if (typeof window === "undefined") return [...SEED];
  try {
    const raw = localStorage.getItem(USUARIOS_LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USUARIOS_LOCAL_STORAGE_KEY, JSON.stringify(SEED));
      return [...SEED];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED];
    const out: UsuarioLocal[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : newId();
      const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
      const email = typeof r.email === "string" ? r.email.trim() : "";
      const rol: UsuarioRol = isRol(r.rol) ? r.rol : "operativo";
      const activo = r.activo !== false;
      const modulos = parseModulos(r.modulos);
      if (!nombre || !email) continue;
      out.push({ id, nombre, email, rol, activo, modulos });
    }
    return out;
  } catch {
    return [...SEED];
  }
}

export function saveUsuarios(items: UsuarioLocal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USUARIOS_LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // noop
  }
}
