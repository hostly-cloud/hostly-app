import { createHash } from "node:crypto";
import { fiscalReadiness, isStoredFiscalConfiguration } from "../lib/fiscal/configuration";
import {
  assertFiscalLiveWindowOpen,
  HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO,
} from "../lib/fiscal/live-activation-policy";
import { readFiscalCertificateSecret } from "../lib/server/fiscal/fiscal-certificate-secret";

function argument(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function stableDocumentId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex");
}

type Check = {
  key: string;
  ok: boolean;
  detail: string;
};

async function main() {
  const restaurantId = argument("restaurant");
  const phase = argument("phase") || "prepare";
  if (!restaurantId || (phase !== "prepare" && phase !== "activate")) {
    throw new Error("Uso: fiscal-go-live-preflight.ts --restaurant=RESTAURANT_ID [--phase=prepare|activate]");
  }

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) throw new Error("Firebase Admin no está configurado");

  const configSnap = await db.collection("fiscalConfigurations").doc(restaurantId).get();
  const raw = configSnap.data();
  if (!configSnap.exists || !isStoredFiscalConfiguration(raw)) {
    throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
  }
  const config = raw;
  const checks: Check[] = [];
  checks.push({ key: "mode", ok: config.mode === "live", detail: config.mode });
  checks.push({ key: "status", ok: config.status === "draft", detail: config.status });
  checks.push({ key: "aeat_environment", ok: config.aeatEnvironment === "production", detail: config.aeatEnvironment });

  for (const row of fiscalReadiness(config)) {
    checks.push({ key: `readiness_${row.key}`, ok: row.ready, detail: row.label });
  }

  let certificateOk = false;
  let certificateDetail = "not configured";
  if (config.certificateSecretResource) {
    try {
      await readFiscalCertificateSecret(config.certificateSecretResource);
      certificateOk = true;
      certificateDetail = "Secret Manager + PKCS#12 valid";
    } catch (error) {
      certificateDetail = error instanceof Error ? error.message : "FISCAL_CERTIFICATE_INVALID";
    }
  }
  checks.push({ key: "certificate_runtime", ok: certificateOk, detail: certificateDetail });

  const tenantCollections = [
    "fiscalInvoices",
    "fiscalRecords",
    "fiscalOutbox",
    "fiscalDeliveryStates",
    "fiscalCounters",
    "fiscalCancellations",
    "fiscalRectificationLedgers",
  ] as const;
  for (const collection of tenantCollections) {
    const snap = await db.collection(collection).where("restaurantId", "==", restaurantId).limit(1).get();
    checks.push({
      key: `clean_${collection}`,
      ok: snap.empty,
      detail: snap.empty ? "clean" : "existing fiscal data detected",
    });
  }

  const chainId = stableDocumentId("chain", config.taxEntityId, config.software.installationNumber);
  const chainSnap = await db.collection("fiscalChains").doc(chainId).get();
  checks.push({
    key: "clean_fiscal_chain",
    ok: !chainSnap.exists,
    detail: chainSnap.exists ? "existing chain detected" : "clean",
  });

  const activationFlag = process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED === "true";
  const submissionFlag = process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED === "true";
  if (phase === "prepare") {
    checks.push({ key: "activation_flag_closed", ok: !activationFlag, detail: activationFlag ? "open" : "closed" });
    checks.push({ key: "submission_flag_closed", ok: !submissionFlag, detail: submissionFlag ? "open" : "closed" });
  } else {
    let liveWindowOpen = true;
    try {
      assertFiscalLiveWindowOpen();
    } catch {
      liveWindowOpen = false;
    }
    checks.push({ key: "live_window", ok: liveWindowOpen, detail: HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO });
    checks.push({ key: "activation_flag_open", ok: activationFlag, detail: activationFlag ? "open" : "closed" });
    checks.push({ key: "submission_flag_open", ok: submissionFlag, detail: submissionFlag ? "open" : "closed" });
  }

  const failed = checks.filter((row) => !row.ok);
  const result = {
    ok: failed.length === 0,
    restaurantId,
    phase,
    fiscalLiveNotBefore: HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO,
    productionDataClean: checks.filter((row) => row.key.startsWith("clean_")).every((row) => row.ok),
    checks,
    failed: failed.map((row) => row.key),
  };
  console.log(JSON.stringify(result, null, 2));
  if (failed.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
