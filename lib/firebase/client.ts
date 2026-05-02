import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

const NEXT_PUBLIC_FIREBASE_API_KEY = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY
);
const NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
);
const NEXT_PUBLIC_FIREBASE_PROJECT_ID = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);
const NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
);
const NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
);
const NEXT_PUBLIC_FIREBASE_APP_ID = trimEnv(
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID
);

const ENV_DEBUG: readonly [string, string][] = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", NEXT_PUBLIC_FIREBASE_API_KEY],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", NEXT_PUBLIC_FIREBASE_PROJECT_ID],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET],
  [
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", NEXT_PUBLIC_FIREBASE_APP_ID],
];

for (const [key, value] of ENV_DEBUG) {
  console.log(`[Firebase] ${key}:`, value ? "ok" : "MISSING");
}

const pid = NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim();
/** Consola Firebase suele mostrar `.firebasestorage.app`; el fallback antiguo era `.appspot.com`. */
const resolvedStorageBucket =
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.trim() !== ""
    ? NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    : pid !== ""
      ? `${pid}.firebasestorage.app`
      : "";

const firebaseConfig: FirebaseOptions = {
  apiKey: NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: resolvedStorageBucket || undefined,
  messagingSenderId: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!NEXT_PUBLIC_FIREBASE_API_KEY) {
  throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY ausente o vacía");
}

export const firebaseEnvDebug = {
  apiKey: NEXT_PUBLIC_FIREBASE_API_KEY || null,
  projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
  authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || null,
};

export const isFirebaseConfigured =
  Boolean(NEXT_PUBLIC_FIREBASE_API_KEY) &&
  Boolean(NEXT_PUBLIC_FIREBASE_PROJECT_ID);

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

/** Misma `app` que Auth/Firestore. Bucket explícito `gs://…` para evitar desajuste con el proyecto real. */
const storageBucketGs =
  resolvedStorageBucket !== "" ? `gs://${resolvedStorageBucket}` : undefined;
if (storageBucketGs) {
  console.log("[Firebase] storage bucket gs:", storageBucketGs);
}

export const storage: FirebaseStorage = storageBucketGs
  ? getStorage(app, storageBucketGs)
  : getStorage(app);

console.log("[Firebase] storage ready");
