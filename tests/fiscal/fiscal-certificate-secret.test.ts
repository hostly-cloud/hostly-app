import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidFiscalCertificateMaterial,
  readFiscalCertificateSecret,
} from "../../lib/server/fiscal/fiscal-certificate-secret";

test("rechaza material que no es un PKCS#12 válido", () => {
  assert.throws(
    () => assertValidFiscalCertificateMaterial({
      pfx: Buffer.alloc(128, 1),
      passphrase: "secret",
    }),
    /FISCAL_CERTIFICATE_PKCS12_INVALID/,
  );
});

test("rechaza referencias de Secret Manager no versionadas sin tocar la red", async () => {
  await assert.rejects(
    readFiscalCertificateSecret("projects/demo/secrets/fiscal-cert"),
    /FISCAL_CERTIFICATE_SECRET_RESOURCE_INVALID/,
  );
});
