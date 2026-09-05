import { randomUUID } from "node:crypto";
import { isStoredFiscalConfiguration } from "../lib/fiscal/configuration";
import { readFiscalCertificateSecret } from "../lib/server/fiscal/fiscal-certificate-secret";

function argument(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

async function main() {
  const restaurantId = argument("restaurant");
  const secretResource = argument("secret-resource");
  const operatorId = argument("operator");
  const representationVerifiedAt = argument("representation-verified-at");
  const apply = process.argv.includes("--apply");
  if (!restaurantId || !secretResource || !operatorId) {
    throw new Error("Uso: administer-fiscal-credential.ts --restaurant=... --secret-resource=projects/.../secrets/.../versions/... --operator=... [--representation-verified-at=ISO] [--apply]");
  }
  if (!/^projects\/[a-z0-9-]+\/secrets\/[A-Za-z0-9_-]+\/versions\/(?:latest|[0-9]+)$/.test(secretResource)) {
    throw new Error("La referencia de Secret Manager no es válida");
  }
  if (representationVerifiedAt && !Number.isFinite(Date.parse(representationVerifiedAt))) {
    throw new Error("--representation-verified-at debe ser una fecha ISO válida");
  }
  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) throw new Error("Firebase Admin no está configurado");
  const configRef = db.collection("fiscalConfigurations").doc(restaurantId);
  const snap = await configRef.get();
  const config = snap.data();
  if (!snap.exists || !isStoredFiscalConfiguration(config)) throw new Error("Configuración fiscal no encontrada");

  const intended = {
    restaurantId,
    taxEntityId: config.taxEntityId,
    secretResource,
    representationVerifiedAt: representationVerifiedAt || null,
    operatorId,
  };
  if (!apply) {
    console.log(JSON.stringify({ applied: false, note: "Vista previa. Repite con --apply para verificar el secreto y escribir.", intended }, null, 2));
    return;
  }

  await readFiscalCertificateSecret(secretResource);
  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(configRef);
    const current = currentSnap.data();
    if (!currentSnap.exists || !isStoredFiscalConfiguration(current) || current.taxEntityId !== config.taxEntityId) {
      throw new Error("La configuración fiscal cambió durante la operación");
    }
    tx.update(configRef, {
      certificateSecretResource: secretResource,
      ...(representationVerifiedAt ? { representationVerifiedAt: new Date(representationVerifiedAt).toISOString() } : {}),
      updatedAtMs: nowMs,
      updatedBy: operatorId,
    });
    tx.create(db.collection("fiscalAuditEvents").doc(randomUUID()), {
      restaurantId,
      taxEntityId: current.taxEntityId,
      actorUid: operatorId,
      action: current.certificateSecretResource ? "fiscal_certificate_rotated" : "fiscal_certificate_configured",
      entityType: "fiscalConfiguration",
      entityId: restaurantId,
      result: "success",
      source: "secure_operations_cli",
      createdAtMs: nowMs,
    });
  });
  console.log(JSON.stringify({ applied: true, restaurantId, secretResource, certificateMaterialLogged: false }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
