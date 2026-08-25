import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { auditProductGtinIndex } from "@/lib/productos/gtin-index-audit";

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

if (!process.argv.includes("--confirm-read-only")) {
  throw new Error("Añade --confirm-read-only para confirmar una auditoría sin escrituras");
}

const restaurantId = argValue("restaurantId");
if (!restaurantId || restaurantId.includes("/") || restaurantId.includes("..")) {
  throw new Error("Define --restaurantId=<id> con un identificador válido");
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS es obligatorio");
}
const projectId =
  process.env.GCLOUD_PROJECT?.trim() ||
  process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
  process.env.FIREBASE_PROJECT_ID?.trim();
if (!projectId) {
  throw new Error("Define FIREBASE_PROJECT_ID explícitamente");
}

const app = initializeApp(
  { credential: applicationDefault(), projectId },
  "hostly-product-gtin-read-only-audit",
);
const db = getFirestore(app);
const restaurantRef = db.collection("restaurants").doc(restaurantId);

const [productsSnapshot, indexSnapshot] = await Promise.all([
  restaurantRef.collection("products").get(),
  restaurantRef.collection("productBarcodeIndex").get(),
]);

const products = productsSnapshot.docs.map((document) => ({
  productId: document.id,
  ...(document.data() as Record<string, unknown>),
}));
const indexes = indexSnapshot.docs.map((document) => ({
  gtin: document.id,
  ...(document.data() as Record<string, unknown>),
}));

const result = auditProductGtinIndex({ products, indexes });
console.log(
  JSON.stringify(
    {
      mode: "read-only",
      projectId,
      restaurantId,
      ...result,
    },
    null,
    2,
  ),
);

await deleteApp(app);
