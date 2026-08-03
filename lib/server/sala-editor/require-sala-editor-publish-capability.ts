import type { Firestore } from "firebase-admin/firestore";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

/**
 * Capability canónica de configuración Hostly.
 * Matriz actual: solo owner/admin (manager/encargado NO la tienen).
 */
export const SALA_EDITOR_PUBLISH_CAPABILITY = "settings.manage" as const;

export const SALA_EDITOR_PUBLISH_FORBIDDEN_ERROR = "SETTINGS_MANAGE_REQUIRED" as const;

/** Lee el rol del perfil (users → usuarios), sin cambiar el helper global de auth. */
export async function resolveProfileRoleForSalaEditorPublish(
  db: Firestore,
  uid: string,
): Promise<unknown> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  for (const collectionName of ["users", "usuarios"] as const) {
    const snap = await db.collection(collectionName).doc(trimmed).get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data && "role" in data) return data.role;
  }
  return null;
}

export function canPublishSalaEditorMap(role: unknown): boolean {
  return serverRoleHasCapability(role, SALA_EDITOR_PUBLISH_CAPABILITY);
}
