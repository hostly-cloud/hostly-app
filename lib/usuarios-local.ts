/**
 * Persistencia local del módulo Usuarios (TPV / demo hasta auth real).
 */

export const USUARIOS_LOCAL_STORAGE_KEY = "hostly.usuarios.equipo.v1";

export const USUARIO_ROLES = ["admin", "encargado", "operativo"] as const;
export type UsuarioRol = (typeof USUARIO_ROLES)[number];

export const USUARIO_MODULOS = ["stock", "compras", "mermas", "escandallos"] as const;
export type UsuarioModulo = (typeof USUARIO_MODULOS)[number];

export type UsuarioModulos = Record<UsuarioModulo, boolean>;

export type UsuarioInviteStatus = "pending" | "accepted" | "expired" | "cancelled" | "error";

export type UsuarioLocal = {
  id: string;
  nombre: string;
  email: string;
  rol: UsuarioRol;
  activo: boolean;
  modulos: UsuarioModulos;
  inviteStatus?: UsuarioInviteStatus;
  inviteUrl?: string;
  inviteError?: string;
  inviteId?: string;
};

const DEMO_USER_ID_PREFIX = "seed-";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `usr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultModulos(): UsuarioModulos {
  return { stock: true, compras: true, mermas: true, escandallos: true };
}

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

export function isDemoUsuarioId(id: string): boolean {
  return id.startsWith(DEMO_USER_ID_PREFIX);
}

function parseInviteStatus(v: unknown): UsuarioInviteStatus | undefined {
  if (v === "pending" || v === "accepted" || v === "expired" || v === "cancelled" || v === "error") {
    return v;
  }
  return undefined;
}

function parseUsuarioRow(row: unknown): UsuarioLocal | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : newId();
  if (isDemoUsuarioId(id)) return null;

  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
  const email = typeof r.email === "string" ? r.email.trim() : "";
  const rol: UsuarioRol = isRol(r.rol) ? r.rol : "operativo";
  const activo = r.activo !== false;
  const modulos = parseModulos(r.modulos);
  if (!nombre || !email) return null;

  const inviteStatus = parseInviteStatus(r.inviteStatus);
  const inviteId = typeof r.inviteId === "string" && r.inviteId.trim() ? r.inviteId.trim() : undefined;

  return {
    id,
    nombre,
    email,
    rol,
    activo,
    modulos,
    ...(inviteStatus ? { inviteStatus } : {}),
    ...(inviteId ? { inviteId } : {}),
  };
}

export function sanitizeUsuarioForPersistence(
  user: UsuarioLocal,
): UsuarioLocal {
  const {
    inviteUrl: _inviteUrl,
    inviteError: _inviteError,
    ...persistent
  } = user;
  void _inviteUrl;
  void _inviteError;
  return persistent;
}

export function parseUsuariosStoragePayload(raw: unknown): UsuarioLocal[] {
  if (!Array.isArray(raw)) return [];
  const users: UsuarioLocal[] = [];
  for (const row of raw) {
    const user = parseUsuarioRow(row);
    if (user) users.push(user);
  }
  return users;
}

export function defaultModulosForRol(rol: UsuarioRol): UsuarioModulos {
  if (rol === "admin" || rol === "encargado") return defaultModulos();
  return { stock: true, compras: false, mermas: true, escandallos: false };
}

export function newUsuarioId(): string {
  return newId();
}

export function loadUsuarios(): UsuarioLocal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USUARIOS_LOCAL_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      saveUsuarios([]);
      return [];
    }

    const out = parseUsuariosStoragePayload(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(out)) {
      saveUsuarios(out);
    }

    return out;
  } catch {
    return [];
  }
}

export function saveUsuarios(items: UsuarioLocal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      USUARIOS_LOCAL_STORAGE_KEY,
      JSON.stringify(items.map(sanitizeUsuarioForPersistence)),
    );
  } catch {
    // noop
  }
}

export function patchUsuarioLocal(id: string, patch: Partial<UsuarioLocal>): UsuarioLocal[] {
  const current = loadUsuarios();
  const next = current.map((user) => (user.id === id ? { ...user, ...patch } : user));
  saveUsuarios(next);
  return next;
}
