import { FieldValue } from "firebase-admin/firestore";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { normalizePhoneNumber } from "@/lib/phone-ai/twilio";
import { phoneAiNumberMappingId } from "@/lib/server/phone-ai/phone-ai-center";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

const restaurantId = arg("--restaurant-id");
const incomingNumber = normalizePhoneNumber(arg("--number"));
const verify = process.argv.includes("--verify");

if (!restaurantId || !incomingNumber) {
  throw new Error("Usage: npm run admin:phone-ai-number -- --restaurant-id <id> --number +34... [--verify]");
}

const db = getHostlyFirestore();
if (!db) throw new Error("Firebase Admin no disponible");

const settingsRef = db.collection("restaurants").doc(restaurantId).collection("integrations").doc("phoneAi");
const mappingRef = db.collection("_phoneAiNumberMappings").doc(phoneAiNumberMappingId(incomingNumber));

await db.runTransaction(async (tx) => {
  const [restaurant, mapping] = await Promise.all([
    tx.get(db.collection("restaurants").doc(restaurantId)),
    tx.get(mappingRef),
  ]);
  if (!restaurant.exists) throw new Error("RESTAURANT_NOT_FOUND");
  const mappedRestaurant = typeof mapping.data()?.restaurantId === "string" ? mapping.data()?.restaurantId : "";
  if (mappedRestaurant && mappedRestaurant !== restaurantId) throw new Error("PHONE_NUMBER_ALREADY_ASSIGNED");

  tx.set(settingsRef, {
    provider: "twilio",
    incomingNumber,
    provisioningStatus: verify ? "verified" : "pending",
    enabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  tx.set(mappingRef, {
    restaurantId,
    verified: verify,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

console.log(JSON.stringify({ ok: true, restaurantId, incomingNumber, verified: verify }));
