import type { FirebaseOptions } from "firebase/app";

/**
 * Pure Firebase web client config resolution.
 * Kept free of initializeApp side effects so unit tests can exercise
 * production/dev/stub rules without touching the network.
 */

export type FirebaseClientEnvInput = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export type ResolvedFirebaseClientConfig = {
  config: FirebaseOptions;
  resolvedStorageBucket: string;
  isFirebaseConfigured: boolean;
  usedDevStub: boolean;
};

/** Clearly local stub project — never a production Hostly project id. */
export const DEV_FIREBASE_STUB_PROJECT_ID = "hostly-dev-local";

/**
 * Minimal options so `initializeApp` can run in `next dev` without `.env.local`.
 * Not a real Firebase project; `isFirebaseConfigured` stays false.
 */
export const DEV_FIREBASE_STUB_CONFIG: FirebaseOptions = {
  apiKey: "dev-local-placeholder-api-key",
  authDomain: `${DEV_FIREBASE_STUB_PROJECT_ID}.firebaseapp.com`,
  projectId: DEV_FIREBASE_STUB_PROJECT_ID,
  storageBucket: `${DEV_FIREBASE_STUB_PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:devlocalplaceholder0001",
};

export function trimFirebaseEnvValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readFirebaseClientEnvFromProcess(
  env: NodeJS.ProcessEnv = process.env,
): FirebaseClientEnvInput {
  return {
    apiKey: trimFirebaseEnvValue(env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: trimFirebaseEnvValue(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: trimFirebaseEnvValue(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: trimFirebaseEnvValue(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: trimFirebaseEnvValue(
      env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    ),
    appId: trimFirebaseEnvValue(env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

/** Stub values must never look like real Firebase / PEM credentials. */
export function assertDevStubLooksNonCredential(
  config: FirebaseOptions = DEV_FIREBASE_STUB_CONFIG,
): void {
  const apiKey = String(config.apiKey ?? "");
  const appId = String(config.appId ?? "");
  const blob = JSON.stringify(config);
  if (apiKey.startsWith("AIza")) {
    throw new Error("Dev Firebase stub must not use an AIza-prefixed apiKey");
  }
  if (/BEGIN ([A-Z ]*)PRIVATE KEY/.test(blob)) {
    throw new Error("Dev Firebase stub must not embed a private key");
  }
  if (config.projectId !== DEV_FIREBASE_STUB_PROJECT_ID) {
    throw new Error("Dev Firebase stub projectId must be hostly-dev-local");
  }
  if (!appId.includes("devlocalplaceholder")) {
    throw new Error("Dev Firebase stub appId must stay a local placeholder");
  }
}

export function resolveFirebaseClientConfig(params: {
  env: FirebaseClientEnvInput;
  nodeEnv: string | undefined;
}): ResolvedFirebaseClientConfig {
  const isProd = params.nodeEnv === "production";
  const {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  } = params.env;

  if (!apiKey) {
    if (isProd) {
      throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY ausente o vacía");
    }
    assertDevStubLooksNonCredential(DEV_FIREBASE_STUB_CONFIG);
    return {
      config: { ...DEV_FIREBASE_STUB_CONFIG },
      resolvedStorageBucket: String(DEV_FIREBASE_STUB_CONFIG.storageBucket ?? ""),
      isFirebaseConfigured: false,
      usedDevStub: true,
    };
  }

  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID ausente o vacía. Complétala en .env.local junto a la API key.",
    );
  }

  if (isProd && !appId) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_APP_ID ausente o vacía (requerido en producción). Rellena el valor del SDK en el hosting.",
    );
  }

  const resolvedAuthDomain =
    authDomain !== "" ? authDomain : `${projectId}.firebaseapp.com`;
  const resolvedStorageBucket =
    storageBucket !== ""
      ? storageBucket
      : `${projectId}.firebasestorage.app`;

  return {
    config: {
      apiKey,
      authDomain: resolvedAuthDomain,
      projectId,
      storageBucket: resolvedStorageBucket || undefined,
      messagingSenderId,
      appId,
    },
    resolvedStorageBucket,
    isFirebaseConfigured: true,
    usedDevStub: false,
  };
}
