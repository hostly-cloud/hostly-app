import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (key) process.env[key] = val;
  }
}

const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
if (!gac || !fs.existsSync(gac)) {
  console.error(
    "Falta GOOGLE_APPLICATION_CREDENTIALS en .env.local o el archivo no existe."
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(gac, "utf8"));
const projectId =
  typeof serviceAccount.project_id === "string"
    ? serviceAccount.project_id
    : "";
if (!projectId) {
  console.error("No se encontró project_id en el JSON de credenciales.");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ projectId });
}

const db = getFirestore();

const RESTAURANT_ID =
  process.argv[2]?.trim() || process.env.SEED_RESTAURANT_UID?.trim();
if (!RESTAURANT_ID) {
  console.error(
    "Define el UID del usuario (restaurantId). Ej: node scripts/seed-productos.mjs <UID> o SEED_RESTAURANT_UID en .env.local"
  );
  process.exit(1);
}

const productos = [
  { nombre: "Hamburguesa clásica", categoria: "Comida", precio: 12 },
  { nombre: "Ensalada César", categoria: "Comida", precio: 9 },
  { nombre: "Cerveza", categoria: "Bebida", precio: 3 },
  { nombre: "Coca-Cola", categoria: "Bebida", precio: 2.5 },
  { nombre: "Tarta de queso", categoria: "Postre", precio: 6 },
];

async function main() {
  const col = db.collection("productos");
  for (const p of productos) {
    const ref = await col.add({
      ...p,
      restaurantId: RESTAURANT_ID,
      createdAt: Date.now(),
    });
    console.log("OK", p.nombre, "→", ref.id);
  }
  console.log("Listo:", productos.length, "documentos en productos.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
