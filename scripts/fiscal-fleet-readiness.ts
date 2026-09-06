import { createHash } from "node:crypto";
import { fiscalReadiness, isStoredFiscalConfiguration } from "../lib/fiscal/configuration";
import { fiscalLiveReadiness } from "../lib/fiscal/live-readiness";
import { readFiscalCertificateSecret } from "../lib/server/fiscal/fiscal-certificate-secret";

function argument(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function stableDocumentId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex");
}

const tenantCollections = [
  "fiscalInvoices",
  "fiscalRecords",
  "fiscalOutbox",
  "fiscalDeliveryStates",
  "fiscalCounters",
  "fiscalCancellations",
  "fiscalRectificationLedgers",
] as const;

async function main() {
  const phase = argument("phase") || "prepare";
  if (phase !== "prepare" && phase !== "activate") {
    throw new Error("Uso: fiscal-fleet-readiness.ts [--phase=prepare|activate]");
  }

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) throw new Error("Firebase Admin no está configurado");

  const configs = await db.collection("fiscalConfigurations").get();
  const rows: Array<Record<string, unknown>> = [];

  for (const snap of configs.docs) {
    const raw = snap.data();
    if (!isStoredFiscalConfiguration(raw)) {
      rows.push({ restaurantId: snap.id, ready: false, failed: ["configuration_corrupt"] });
      continue;
    }
    const config = raw;
    const failed: string[] = [];

    if (config.mode !== "live") failed.push("mode_live");
    if (config.status !== "draft") failed.push("status_draft");
    if (config.aeatEnvironment !== "production") failed.push("aeat_environment");

    for (const check of fiscalReadiness(config)) {
      if (!check.ready) failed.push(`readiness_${check.key}`);
    }

    let certificateRuntimeOk = false;
    if (config.certificateSecretResource) {
      try {
        await readFiscalCertificateSecret(config.certificateSecretResource);
        certificateRuntimeOk = true;
      } catch {
        certificateRuntimeOk = false;
      }
    }
    if (!certificateRuntimeOk) failed.push("certificate_runtime");

    let productionDataClean = true;
    for (const collection of tenantCollections) {
      const existing = await db.collection(collection).where("restaurantId", "==", config.restaurantId).limit(1).get();
      if (!existing.empty) {
        productionDataClean = false;
        failed.push(`clean_${collection}`);
      }
    }

    const chainId = stableDocumentId("chain", config.taxEntityId, config.software.installationNumber);
    const chainSnap = await db.collection("fiscalChains").doc(chainId).get();
    if (chainSnap.exists) {
      productionDataClean = false;
      failed.push("clean_fiscal_chain");
    }

    const live = fiscalLiveReadiness(config);
    if (phase === "prepare") {
      if (live.activationFlagEnabled) failed.push("activation_flag_must_be_closed");
      if (live.submissionFlagEnabled) failed.push("submission_flag_must_be_closed");
    } else {
      for (const blocker of live.blockers) failed.push(`live_${blocker}`);
    }

    rows.push({
      restaurantId: config.restaurantId,
      ready: failed.length === 0,
      phase,
      productionDataClean,
      certificateRuntimeOk,
      missingConfiguration: fiscalReadiness(config).filter((item) => !item.ready).map((item) => item.key),
      failed: [...new Set(failed)],
    });
  }

  const ready = rows.filter((row) => row.ready === true);
  const blocked = rows.filter((row) => row.ready !== true);
  console.log(JSON.stringify({
    ok: blocked.length === 0,
    phase,
    total: rows.length,
    ready: ready.length,
    blocked: blocked.length,
    restaurants: rows,
  }, null, 2));
  if (blocked.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
