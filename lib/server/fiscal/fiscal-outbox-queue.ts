import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { isStoredFiscalConfiguration } from "@/lib/fiscal/configuration";
import type { AeatEnvironment } from "@/lib/fiscal/model";
import { markVerifactuEnvelopeAsIncident } from "@/lib/fiscal/verifactu-xml";
import { submitAeatVerifactu, type AeatSubmissionResult } from "@/lib/server/fiscal/aeat-verifactu-client";
import { readFiscalCertificateSecret } from "@/lib/server/fiscal/fiscal-certificate-secret";
import {
  FiscalXmlSchemaError,
  validateVerifactuEnvelopeAgainstOfficialSchemas,
} from "@/lib/server/fiscal/verifactu-xsd-validator";

export const FISCAL_AEAT_QUEUE_TOPIC = "fiscal-aeat-submit";
const LEASE_MS = 90_000;
const MAX_BACKOFF_MS = 60 * 60 * 1_000;

export type FiscalOutboxQueueMessage = { recordId: string };

export class FiscalQueueMessageError extends Error {
  readonly code = "FISCAL_QUEUE_MESSAGE_INVALID";
}

export class FiscalQueueRetryError extends Error {
  readonly code = "FISCAL_QUEUE_RETRY";
  constructor(readonly retryAfterSeconds: number, reason: string) {
    super(reason);
  }
}

function assertRecordId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(id)) throw new FiscalQueueMessageError("FISCAL_RECORD_ID_INVALID");
  return id;
}

function enqueueKey(recordId: string, revision: number): string {
  return `fiscal-${createHash("sha256").update(`${recordId}\u0000${revision}`).digest("hex")}`;
}

export async function enqueueFiscalRecord(recordIdInput: string, revision = 0): Promise<void> {
  const recordId = assertRecordId(recordIdInput);
  await send(
    FISCAL_AEAT_QUEUE_TOPIC,
    { recordId } satisfies FiscalOutboxQueueMessage,
    { idempotencyKey: enqueueKey(recordId, revision), retentionSeconds: 24 * 60 * 60 },
  );
}

export function fiscalQueueRetryDecision(error: unknown): { acknowledge: true } | { afterSeconds: number } {
  if (error instanceof FiscalQueueMessageError) return { acknowledge: true };
  if (error instanceof FiscalQueueRetryError) return { afterSeconds: error.retryAfterSeconds };
  return { afterSeconds: 60 };
}

type ClaimedOutbox = {
  recordId: string;
  restaurantId: string;
  taxEntityId: string;
  installationNumber: string;
  chainSequence: number;
  invoiceId: string;
  environment: AeatEnvironment;
  xmlEnvelope: string;
  attempts: number;
};

export type FiscalChainDeliveryDecision = "next" | "wait_for_predecessor" | "already_passed";

export function fiscalChainDeliveryDecision(
  lastSubmittedChainSequence: number,
  chainSequence: number,
): FiscalChainDeliveryDecision {
  if (!Number.isSafeInteger(lastSubmittedChainSequence) || lastSubmittedChainSequence < 0) {
    throw new Error("FISCAL_FLOW_SEQUENCE_CORRUPT");
  }
  if (!Number.isSafeInteger(chainSequence) || chainSequence < 1) {
    throw new Error("FISCAL_OUTBOX_CHAIN_SEQUENCE_CORRUPT");
  }
  if (chainSequence === lastSubmittedChainSequence + 1) return "next";
  if (chainSequence > lastSubmittedChainSequence + 1) return "wait_for_predecessor";
  return "already_passed";
}

function readClaim(recordId: string, value: FirebaseFirestore.DocumentData): ClaimedOutbox {
  const restaurantId = typeof value.restaurantId === "string" ? value.restaurantId : "";
  const taxEntityId = typeof value.taxEntityId === "string" ? value.taxEntityId : "";
  const installationNumber = typeof value.installationNumber === "string" ? value.installationNumber : "";
  const chainSequence = Number(value.chainSequence);
  const invoiceId = typeof value.invoiceId === "string" ? value.invoiceId : "";
  const environment = value.environment;
  const xmlEnvelope = typeof value.xmlEnvelope === "string" ? value.xmlEnvelope : "";
  const attempts = Number(value.attempts);
  if (!restaurantId || !taxEntityId || !installationNumber || !Number.isSafeInteger(chainSequence) || chainSequence < 1 || !invoiceId || (environment !== "test" && environment !== "production") || !xmlEnvelope || !Number.isSafeInteger(attempts) || attempts < 0) {
    throw new Error("FISCAL_OUTBOX_CORRUPT");
  }
  return { recordId, restaurantId, taxEntityId, installationNumber, chainSequence, invoiceId, environment, xmlEnvelope, attempts };
}

function finalDeliveryStatus(result: AeatSubmissionResult): "accepted" | "accepted_with_errors" | "rejected" {
  if (result.recordStatus === "Correcto") return "accepted";
  if (result.recordStatus === "AceptadoConErrores") return "accepted_with_errors";
  if (result.duplicateStatus === "Correcto") return "accepted";
  if (result.duplicateStatus === "AceptadoConErrores") return "accepted_with_errors";
  return "rejected";
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const code = message.split(":", 1)[0]!.replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
  return code.slice(0, 100) || "UNKNOWN_ERROR";
}

export async function processFiscalOutboxMessage(
  message: unknown,
  dependencies?: {
    db?: Firestore;
    readCertificate?: typeof readFiscalCertificateSecret;
    submit?: typeof submitAeatVerifactu;
    validateXml?: typeof validateVerifactuEnvelopeAgainstOfficialSchemas;
    now?: () => number;
  },
): Promise<{ status: string; processed: boolean }> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new FiscalQueueMessageError("FISCAL_QUEUE_MESSAGE_INVALID");
  }
  const recordId = assertRecordId((message as Record<string, unknown>).recordId);
  const db = dependencies?.db ?? getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const nowMs = (dependencies?.now ?? Date.now)();
  const outboxRef = db.collection("fiscalOutbox").doc(recordId);
  let claim: ClaimedOutbox | null = null;
  let flowControlRef: FirebaseFirestore.DocumentReference | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(outboxRef);
    if (!snap.exists) throw new FiscalQueueMessageError("FISCAL_OUTBOX_NOT_FOUND");
    const data = snap.data()!;
    const status = String(data.status ?? "");
    if (["accepted", "accepted_with_errors", "rejected"].includes(status)) return;
    const parsedClaim = readClaim(recordId, data);
    const flowId = createHash("sha256").update(`${parsedClaim.taxEntityId}\u0000${parsedClaim.installationNumber}\u0000${parsedClaim.environment}`, "utf8").digest("hex");
    const nextFlowControlRef = db.collection("fiscalAeatFlowControls").doc(flowId);
    const flowSnap = await tx.get(nextFlowControlRef);
    const nextAttemptAtMs = Number(data.nextAttemptAtMs) || 0;
    if (nextAttemptAtMs > nowMs) {
      throw new FiscalQueueRetryError(Math.max(1, Math.ceil((nextAttemptAtMs - nowMs) / 1000)), "FISCAL_RETRY_NOT_DUE");
    }
    const leaseUntilMs = Number(data.leaseUntilMs) || 0;
    if (status === "sending" && leaseUntilMs > nowMs) {
      throw new FiscalQueueRetryError(Math.max(1, Math.ceil((leaseUntilMs - nowMs) / 1000)), "FISCAL_LEASE_ACTIVE");
    }
    const flowAvailableAtMs = Number(flowSnap.data()?.availableAtMs) || 0;
    const flowLeaseUntilMs = Number(flowSnap.data()?.leaseUntilMs) || 0;
    const lastSubmittedChainSequence = Number(flowSnap.data()?.lastSubmittedChainSequence) || 0;
    const chainDecision = fiscalChainDeliveryDecision(lastSubmittedChainSequence, parsedClaim.chainSequence);
    if (chainDecision === "wait_for_predecessor") {
      throw new FiscalQueueRetryError(60, "FISCAL_CHAIN_PREDECESSOR_PENDING");
    }
    if (chainDecision === "already_passed") {
      throw new FiscalQueueMessageError("FISCAL_CHAIN_SEQUENCE_ALREADY_PASSED");
    }
    if (flowAvailableAtMs > nowMs || flowLeaseUntilMs > nowMs) {
      const resumeAtMs = Math.max(flowAvailableAtMs, flowLeaseUntilMs);
      throw new FiscalQueueRetryError(Math.max(1, Math.ceil((resumeAtMs - nowMs) / 1_000)), "FISCAL_AEAT_FLOW_CONTROL_ACTIVE");
    }
    claim = parsedClaim;
    flowControlRef = nextFlowControlRef;
    tx.update(outboxRef, {
      status: "sending",
      attempts: claim.attempts + 1,
      leaseUntilMs: nowMs + LEASE_MS,
      updatedAtMs: nowMs,
    });
    tx.set(nextFlowControlRef, {
      taxEntityId: parsedClaim.taxEntityId,
      installationNumber: parsedClaim.installationNumber,
      environment: parsedClaim.environment,
      lockedByRecordId: recordId,
      leaseUntilMs: nowMs + LEASE_MS,
      updatedAtMs: nowMs,
    }, { merge: true });
  });

  if (!claim || !flowControlRef) return { status: "already_final", processed: false };
  const claimed = claim as ClaimedOutbox;
  const claimedFlowControlRef: FirebaseFirestore.DocumentReference = flowControlRef;
  const attempt = claimed.attempts + 1;
  const submissionRef = db.collection("fiscalSubmissions").doc(`${recordId}_${String(attempt).padStart(6, "0")}`);
  const deliveryRef = db.collection("fiscalDeliveryStates").doc(recordId);

  try {
    const configSnap = await db.collection("fiscalConfigurations").doc(claimed.restaurantId).get();
    const config = configSnap.data();
    if (!configSnap.exists || !isStoredFiscalConfiguration(config)) throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
    if (
      config.restaurantId !== claimed.restaurantId
      || config.taxEntityId !== claimed.taxEntityId
      || config.software.installationNumber !== claimed.installationNumber
    ) {
      throw new Error("FISCAL_OUTBOX_TENANT_MISMATCH");
    }
    if (!config.certificateSecretResource) throw new Error("FISCAL_CERTIFICATE_NOT_CONFIGURED");
    const submissionEnvelope = claimed.attempts > 0
      ? markVerifactuEnvelopeAsIncident(claimed.xmlEnvelope)
      : claimed.xmlEnvelope;
    await (dependencies?.validateXml ?? validateVerifactuEnvelopeAgainstOfficialSchemas)(submissionEnvelope);
    const certificate = await (dependencies?.readCertificate ?? readFiscalCertificateSecret)(config.certificateSecretResource);
    const response = await (dependencies?.submit ?? submitAeatVerifactu)({
      environment: claimed.environment,
      xmlEnvelope: submissionEnvelope,
      certificate,
    });
    const status = finalDeliveryStatus(response);
    const completedAtMs = (dependencies?.now ?? Date.now)();
    await db.runTransaction(async (tx) => {
      const current = await tx.get(outboxRef);
      if (!current.exists) throw new Error("FISCAL_OUTBOX_NOT_FOUND");
      if (Number(current.data()?.attempts) !== attempt) return;
      tx.create(submissionRef, {
        restaurantId: claimed.restaurantId,
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        chainSequence: claimed.chainSequence,
        invoiceId: claimed.invoiceId,
        recordId,
        attempt,
        environment: claimed.environment,
        status,
        response,
        requestHadIncidence: claimed.attempts > 0,
        requestPayloadHash: createHash("sha256").update(submissionEnvelope, "utf8").digest("hex"),
        completedAtMs,
      });
      tx.update(outboxRef, { status, leaseUntilMs: null, updatedAtMs: completedAtMs, completedAtMs });
      tx.set(deliveryRef, {
        restaurantId: claimed.restaurantId,
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        chainSequence: claimed.chainSequence,
        invoiceId: claimed.invoiceId,
        recordId,
        status,
        attempts: attempt,
        aeat: response,
        updatedAtMs: completedAtMs,
      });
      tx.set(claimedFlowControlRef, {
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        environment: claimed.environment,
        lastSubmittedChainSequence: claimed.chainSequence,
        lockedByRecordId: null,
        leaseUntilMs: null,
        availableAtMs: completedAtMs + Math.max(0, response.waitSeconds) * 1_000,
        waitSeconds: Math.max(0, response.waitSeconds),
        updatedAtMs: completedAtMs,
      }, { merge: true });
      tx.create(db.collection("fiscalAuditEvents").doc(`${recordId}_${String(attempt).padStart(6, "0")}`), {
        restaurantId: claimed.restaurantId,
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        chainSequence: claimed.chainSequence,
        actorUid: "system",
        action: "fiscal_record_submitted",
        entityType: "fiscalRecord",
        entityId: recordId,
        result: status,
        source: "aeat_queue",
        createdAtMs: completedAtMs,
      });
    });
    return { status, processed: true };
  } catch (error) {
    if (error instanceof FiscalQueueMessageError || error instanceof FiscalQueueRetryError) throw error;
    const failureCode = safeFailureCode(error);
    const failedAtMs = (dependencies?.now ?? Date.now)();
    if (error instanceof FiscalXmlSchemaError) {
      const schemaRetryMs = MAX_BACKOFF_MS;
      await db.runTransaction(async (tx) => {
        const current = await tx.get(outboxRef);
        if (!current.exists || Number(current.data()?.attempts) !== attempt) return;
        tx.create(submissionRef, {
          restaurantId: claimed.restaurantId,
          taxEntityId: claimed.taxEntityId,
          installationNumber: claimed.installationNumber,
          chainSequence: claimed.chainSequence,
          invoiceId: claimed.invoiceId,
          recordId,
          attempt,
          environment: claimed.environment,
          status: "schema_error",
          failureCode,
          completedAtMs: failedAtMs,
        });
        tx.update(outboxRef, {
          status: "retry_scheduled",
          leaseUntilMs: null,
          nextAttemptAtMs: failedAtMs + schemaRetryMs,
          lastFailureCode: failureCode,
          updatedAtMs: failedAtMs,
        });
        tx.set(claimedFlowControlRef, { lockedByRecordId: null, leaseUntilMs: null, updatedAtMs: failedAtMs }, { merge: true });
        tx.set(deliveryRef, { restaurantId: claimed.restaurantId, taxEntityId: claimed.taxEntityId, installationNumber: claimed.installationNumber, chainSequence: claimed.chainSequence, invoiceId: claimed.invoiceId, recordId, status: "schema_error", attempts: attempt, lastFailureCode: failureCode, nextAttemptAtMs: failedAtMs + schemaRetryMs, updatedAtMs: failedAtMs });
        tx.create(db.collection("fiscalAuditEvents").doc(`${recordId}_${String(attempt).padStart(6, "0")}`), { restaurantId: claimed.restaurantId, taxEntityId: claimed.taxEntityId, actorUid: "system", action: "fiscal_xml_schema_error", entityType: "fiscalRecord", entityId: recordId, result: "retry_scheduled", source: "aeat_queue", createdAtMs: failedAtMs });
      });
      throw new FiscalQueueRetryError(Math.ceil(schemaRetryMs / 1_000), failureCode);
    }
    const backoffMs = Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.min(attempt - 1, 10));
    await db.runTransaction(async (tx) => {
      const current = await tx.get(outboxRef);
      if (!current.exists || Number(current.data()?.attempts) !== attempt) return;
      tx.create(submissionRef, {
        restaurantId: claimed.restaurantId,
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        chainSequence: claimed.chainSequence,
        invoiceId: claimed.invoiceId,
        recordId,
        attempt,
        environment: claimed.environment,
        status: "transport_error",
        failureCode,
        completedAtMs: failedAtMs,
      });
      tx.update(outboxRef, {
        status: "retry_scheduled",
        leaseUntilMs: null,
        nextAttemptAtMs: failedAtMs + backoffMs,
        lastFailureCode: failureCode,
        updatedAtMs: failedAtMs,
      });
      tx.set(claimedFlowControlRef, { lockedByRecordId: null, leaseUntilMs: null, updatedAtMs: failedAtMs }, { merge: true });
      tx.set(deliveryRef, {
        restaurantId: claimed.restaurantId,
        taxEntityId: claimed.taxEntityId,
        installationNumber: claimed.installationNumber,
        chainSequence: claimed.chainSequence,
        invoiceId: claimed.invoiceId,
        recordId,
        status: "retry_scheduled",
        attempts: attempt,
        lastFailureCode: failureCode,
        nextAttemptAtMs: failedAtMs + backoffMs,
        updatedAtMs: failedAtMs,
      });
    });
    throw new FiscalQueueRetryError(Math.ceil(backoffMs / 1000), failureCode);
  }
}

export async function recoverDueFiscalOutbox(db: Firestore, nowMs = Date.now()): Promise<{
  inspected: number;
  enqueued: number;
  pending: number;
  oldestPendingAgeMs: number;
  rejected: number;
}> {
  const snapshot = await db.collection("fiscalOutbox")
    .where("status", "in", ["pending", "retry_scheduled", "sending"])
    .limit(100)
    .get();
  const due = snapshot.docs.filter((row) => {
    const data = row.data();
    if (data.status === "sending") return (Number(data.leaseUntilMs) || 0) <= nowMs;
    return (Number(data.nextAttemptAtMs) || 0) <= nowMs;
  });
  let enqueued = 0;
  for (const row of due) {
    const revision = Number(row.data().attempts) || 0;
    await enqueueFiscalRecord(row.id, revision);
    enqueued += 1;
  }
  const oldestCreatedAtMs = snapshot.docs.reduce((oldest, row) => {
    const createdAtMs = Number(row.data().createdAtMs) || nowMs;
    return Math.min(oldest, createdAtMs);
  }, nowMs);
  const rejected = await db.collection("fiscalOutbox").where("status", "==", "rejected").limit(100).get();
  return {
    inspected: snapshot.size,
    enqueued,
    pending: snapshot.size,
    oldestPendingAgeMs: snapshot.empty ? 0 : Math.max(0, nowMs - oldestCreatedAtMs),
    rejected: rejected.size,
  };
}
