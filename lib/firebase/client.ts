import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getToken as getAppCheckToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import {
  resolveFirebaseClientConfig,
  trimFirebaseEnvValue,
} from "@/lib/firebase/client-config";

const isProd = process.env.NODE_ENV === "production";

/**
 * Next.js only guarantees NEXT_PUBLIC_* replacement in client bundles when each
 * variable is referenced statically. Do not pass `process.env` through a helper
 * here: dynamic property access can compile as undefined in the browser even
 * when `.env.local` is complete.
 */
const envInput = {
  apiKey: trimFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: trimFirebaseEnvValue(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),
  projectId: trimFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: trimFirebaseEnvValue(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),
  messagingSenderId: trimFirebaseEnvValue(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: trimFirebaseEnvValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

const appCheckSiteKey = trimFirebaseEnvValue(
  process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY,
);

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

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Firebase App Check (web).
 *
 * The Enterprise site key is public by design. Hostly only initializes App Check
 * when the real Firebase client and a site key are both configured. This keeps
 * local/dev stubs and unconfigured previews working while production can roll
 * out App Check gradually before enforcement is enabled in Firebase Console.
 */
type HostlyBrowserGlobal = typeof globalThis & {
  __hostlyFirebaseAppCheck?: AppCheck;
};

const hostlyBrowserGlobal = globalThis as HostlyBrowserGlobal;
let appCheck: AppCheck | null = hostlyBrowserGlobal.__hostlyFirebaseAppCheck ?? null;

if (
  typeof window !== "undefined" &&
  isFirebaseConfigured &&
  appCheckSiteKey &&
  !appCheck
) {
  try {
    appCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    hostlyBrowserGlobal.__hostlyFirebaseAppCheck = appCheck;
  } catch (error) {
    // Never take the TPV down because attestation bootstrap failed. Firebase
    // enforcement is enabled only after monitor metrics are healthy.
    console.warn("[Firebase] App Check initialization failed", error);
  }
}

export const firebaseAppCheck = appCheck;
export const isFirebaseAppCheckConfigured = Boolean(
  isFirebaseConfigured && appCheckSiteKey,
);

/** Token for Hostly-owned API calls that opt into App Check verification. */
export async function getHostlyAppCheckToken(): Promise<string | null> {
  if (!firebaseAppCheck) return null;
  try {
    const result = await getAppCheckToken(firebaseAppCheck, false);
    return result.token || null;
  } catch {
    return null;
  }
}

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

/** Misma `app` que Auth/Firestore. Bucket explícito `gs://…` para evitar desajuste con el proyecto real. */
const storageBucketGs =
  resolvedStorageBucket !== "" ? `gs://${resolvedStorageBucket}` : undefined;
if (storageBucketGs && !isProd && !resolved.usedDevStub) {
  console.log("[Firebase] storage bucket gs:", storageBucketGs);
}

export const storage: FirebaseStorage = storageBucketGs
  ? getStorage(firebaseApp, storageBucketGs)
  : getStorage(firebaseApp);

if (!isProd && !resolved.usedDevStub) {
  console.log("[Firebase] storage ready");
}
