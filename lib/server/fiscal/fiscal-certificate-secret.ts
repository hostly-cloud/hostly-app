import { createSecureContext } from "node:tls";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export type FiscalCertificateMaterial = {
  pfx: Buffer;
  passphrase: string;
};

function secretManagerClient(): SecretManagerServiceClient {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && rawKey) {
    return new SecretManagerServiceClient({
      projectId,
      credentials: { client_email: clientEmail, private_key: rawKey.replace(/\\n/g, "\n") },
    });
  }
  return new SecretManagerServiceClient();
}

export function assertValidFiscalCertificateMaterial(material: FiscalCertificateMaterial): void {
  try {
    createSecureContext({ pfx: material.pfx, passphrase: material.passphrase, minVersion: "TLSv1.2" });
  } catch {
    throw new Error("FISCAL_CERTIFICATE_PKCS12_INVALID");
  }
}

export async function readFiscalCertificateSecret(
  secretResource: string,
): Promise<FiscalCertificateMaterial> {
  const name = secretResource.trim();
  if (!/^projects\/[A-Za-z0-9._:-]+\/secrets\/[A-Za-z0-9_-]+\/versions\/(?:[1-9]\d*|latest)$/.test(name)) {
    throw new Error("FISCAL_CERTIFICATE_SECRET_RESOURCE_INVALID");
  }
  const client = secretManagerClient();
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString("utf8") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("FISCAL_CERTIFICATE_SECRET_FORMAT_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FISCAL_CERTIFICATE_SECRET_FORMAT_INVALID");
  }
  const row = parsed as Record<string, unknown>;
  const pfxBase64 = typeof row.pfxBase64 === "string" ? row.pfxBase64.trim() : "";
  const passphrase = typeof row.passphrase === "string" ? row.passphrase : "";
  if (!pfxBase64 || pfxBase64.length > 4_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(pfxBase64)) {
    throw new Error("FISCAL_CERTIFICATE_PFX_INVALID");
  }
  const pfx = Buffer.from(pfxBase64, "base64");
  if (pfx.length < 64 || pfx.length > 3_000_000) throw new Error("FISCAL_CERTIFICATE_PFX_INVALID");
  const material = { pfx, passphrase };
  assertValidFiscalCertificateMaterial(material);
  return material;
}
