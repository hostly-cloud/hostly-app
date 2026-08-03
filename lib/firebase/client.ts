import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import {
  readFirebaseClientEnvFromProcess,
  resolveFirebaseClientConfig,
} from "@/lib/firebase/client-config";

const isProd = process.env.NODE_ENV === "production";

const envInput = readFirebaseClientEnvFromProcess();

const ENV_DEBUG: readonly [string, string][] = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", envInput.apiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", envInput.authDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", envInput.projectId],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", envInput.storageBucket],
  [
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    envInput.messagingSenderId,
  ],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", envInput.appId],
];

const resolved = resolveFirebaseClientConfig({
  env: envInput,
  nodeEnv: process.env.NODE_ENV,
});

if (!isProd) {
  if (resolved.usedDevStub) {
    console.info(
      "[Firebase] Dev: `.env.local` sin API key → stub `hostly-dev-local` (UI ok; isFirebaseConfigured=false). Rellena las claves del SDK para datos reales.",
    );
  } else {
    for (const [key, value] of ENV_DEBUG) {
      console.log(`[Firebase] ${key}:`, value ? "ok" : "MISSING");
    }
  }
}

const firebaseConfig = resolved.config;
const resolvedStorageBucket = resolved.resolvedStorageBucket;

export const firebaseEnvDebug = {
  apiKey: envInput.apiKey || null,
  projectId: envInput.projectId || null,
  authDomain: envInput.authDomain || null,
};

/** True only when real NEXT_PUBLIC Firebase web env is present — never for the local stub. */
export const isFirebaseConfigured = resolved.isFirebaseConfigured;

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

/** Misma `app` que Auth/Firestore. Bucket explícito `gs://…` para evitar desajuste con el proyecto real. */
const storageBucketGs =
  resolvedStorageBucket !== "" ? `gs://${resolvedStorageBucket}` : undefined;
if (storageBucketGs && !isProd && !resolved.usedDevStub) {
  console.log("[Firebase] storage bucket gs:", storageBucketGs);
}

export const storage: FirebaseStorage = storageBucketGs
  ? getStorage(app, storageBucketGs)
  : getStorage(app);

if (!isProd && !resolved.usedDevStub) {
  console.log("[Firebase] storage ready");
}
