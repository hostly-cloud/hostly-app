/**
 * Precarga entorno para tests TPV reproducibles sin variables manuales de terminal.
 * - Si existe `.env.local`, carga claves ausentes (no pisa env ya definidas).
 * - Rellena dummies seguros de Firebase client para imports que no tocan producción.
 * - Nunca introduce secretos reales en el repo.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] != null && process.env[key] !== "") continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(resolve(process.cwd(), ".env.local"));
loadDotEnvFile(resolve(process.cwd(), ".env"));

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "demo-hostly-tpv-mutations";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:abc";
process.env.FIREBASE_PROJECT_ID ??=
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-hostly-tpv-mutations";
