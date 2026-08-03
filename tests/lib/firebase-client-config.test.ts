import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEV_FIREBASE_STUB_CONFIG,
  DEV_FIREBASE_STUB_PROJECT_ID,
  assertDevStubLooksNonCredential,
  resolveFirebaseClientConfig,
  type FirebaseClientEnvInput,
} from "../../lib/firebase/client-config";

const emptyEnv: FirebaseClientEnvInput = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

const fullEnv: FirebaseClientEnvInput = {
  apiKey: "test-public-web-key",
  authDomain: "demo-hostly.firebaseapp.com",
  projectId: "demo-hostly",
  storageBucket: "demo-hostly.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789",
};

describe("resolveFirebaseClientConfig", () => {
  test("dev sin env → stub local, isFirebaseConfigured=false, no throw", () => {
    const resolved = resolveFirebaseClientConfig({
      env: emptyEnv,
      nodeEnv: "development",
    });
    assert.equal(resolved.usedDevStub, true);
    assert.equal(resolved.isFirebaseConfigured, false);
    assert.equal(resolved.config.projectId, DEV_FIREBASE_STUB_PROJECT_ID);
    assert.deepEqual(resolved.config, DEV_FIREBASE_STUB_CONFIG);
  });

  test("dev con env completa → config real, isFirebaseConfigured=true", () => {
    const resolved = resolveFirebaseClientConfig({
      env: fullEnv,
      nodeEnv: "development",
    });
    assert.equal(resolved.usedDevStub, false);
    assert.equal(resolved.isFirebaseConfigured, true);
    assert.equal(resolved.config.apiKey, fullEnv.apiKey);
    assert.equal(resolved.config.projectId, fullEnv.projectId);
    assert.equal(resolved.config.authDomain, fullEnv.authDomain);
    assert.equal(resolved.resolvedStorageBucket, fullEnv.storageBucket);
  });

  test("producción sin API key → lanza error claro", () => {
    assert.throws(
      () =>
        resolveFirebaseClientConfig({
          env: emptyEnv,
          nodeEnv: "production",
        }),
      /NEXT_PUBLIC_FIREBASE_API_KEY/,
    );
  });

  test("producción con API key pero sin projectId → lanza error claro", () => {
    assert.throws(
      () =>
        resolveFirebaseClientConfig({
          env: { ...emptyEnv, apiKey: "present-but-incomplete" },
          nodeEnv: "production",
        }),
      /NEXT_PUBLIC_FIREBASE_PROJECT_ID/,
    );
  });

  test("producción con API key + projectId pero sin appId → lanza error claro", () => {
    assert.throws(
      () =>
        resolveFirebaseClientConfig({
          env: {
            ...emptyEnv,
            apiKey: "present",
            projectId: "demo-hostly",
          },
          nodeEnv: "production",
        }),
      /NEXT_PUBLIC_FIREBASE_APP_ID/,
    );
  });

  test("stub no parece credencial real (AIza / PRIVATE KEY / projectId)", () => {
    assert.doesNotThrow(() => assertDevStubLooksNonCredential());
    assert.equal(
      String(DEV_FIREBASE_STUB_CONFIG.apiKey ?? "").startsWith("AIza"),
      false,
    );
    assert.match(
      String(DEV_FIREBASE_STUB_CONFIG.appId ?? ""),
      /devlocalplaceholder/,
    );
  });

  test("defaults authDomain y storageBucket desde projectId cuando faltan", () => {
    const resolved = resolveFirebaseClientConfig({
      env: {
        apiKey: "test-public-web-key",
        authDomain: "",
        projectId: "demo-hostly",
        storageBucket: "",
        messagingSenderId: "1",
        appId: "1:1:web:abc",
      },
      nodeEnv: "development",
    });
    assert.equal(resolved.config.authDomain, "demo-hostly.firebaseapp.com");
    assert.equal(
      resolved.resolvedStorageBucket,
      "demo-hostly.firebasestorage.app",
    );
  });
});
