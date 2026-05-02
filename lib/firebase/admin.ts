/**
 * Firebase Admin (servidor): Firestore para Hostly.
 * Sin credenciales válidas devuelve null — la app sigue en modo localStorage.
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "node:fs";

let cached: Firestore | null | undefined;

export type FirestoreAdminStatus =
  | {
      ok: true;
      method: "env_service_account" | "google_application_credentials";
      projectId: string;
      googleApplicationCredentialsPath?: string;
    }
  | {
      ok: false;
      method: "none";
      projectId: "";
      missing: string[];
      googleApplicationCredentialsPath?: string;
    };

function tryReadProjectIdFromGoogleCredentialsFile(path: string): string {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const json = JSON.parse(raw) as { project_id?: string };
    return typeof json?.project_id === "string" ? json.project_id.trim() : "";
  } catch {
    return "";
  }
}

export function getFirestoreAdminStatus(): FirestoreAdminStatus {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim() || "";
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || "";

  const hasEnvServiceAccount = Boolean(projectId && clientEmail && rawKey);
  if (hasEnvServiceAccount) {
    return { ok: true, method: "env_service_account", projectId };
  }

  // Para la vía JSON, necesitamos projectId explícito (lo sacamos del propio JSON).
  if (gacPath) {
    const pid = tryReadProjectIdFromGoogleCredentialsFile(gacPath);
    if (pid) {
      return {
        ok: true,
        method: "google_application_credentials",
        projectId: pid,
        googleApplicationCredentialsPath: gacPath,
      };
    }
    return {
      ok: false,
      method: "none",
      projectId: "",
      missing: ["project_id (in GOOGLE_APPLICATION_CREDENTIALS JSON)"],
      googleApplicationCredentialsPath: gacPath,
    };
  }

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!rawKey) missing.push("FIREBASE_PRIVATE_KEY");
  missing.push("or GOOGLE_APPLICATION_CREDENTIALS");
  return { ok: false, method: "none", projectId: "", missing };
}

export function getHostlyFirestore(): Firestore | null {
  if (cached !== undefined) return cached;

  const status = getFirestoreAdminStatus();
  if (!status.ok) {
    cached = null;
    return null;
  }

  if (!getApps().length) {
    if (status.method === "env_service_account") {
      const projectId = process.env.FIREBASE_PROJECT_ID!.trim();
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!.trim();
      const rawKey = process.env.FIREBASE_PRIVATE_KEY!.trim();
      const privateKey = rawKey.replace(/\\n/g, "\n");
      initializeApp({
        credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey }),
      });
    } else {
      /**
       * Vía JSON: GOOGLE_APPLICATION_CREDENTIALS.
       * Importante: pasamos projectId explícito (leído del JSON) para evitar "Unable to detect a Project Id".
       */
      initializeApp({ projectId: status.projectId });
    }
  }

  try {
    cached = getFirestore();
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function isFirestoreConfigured(): boolean {
  return getFirestoreAdminStatus().ok;
}
