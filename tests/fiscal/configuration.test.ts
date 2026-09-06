import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFiscalConfigurationCanActivate,
  buildFiscalConfiguration,
  fiscalReadiness,
} from "../../lib/fiscal/configuration";
import { HOSTLY_FISCAL_MODULE_VERSION } from "../../lib/fiscal/version";

const input = {
  mode: "test" as const,
  taxpayerLegalName: "Restaurante Pruebas SL",
  taxpayerNif: "B12345674",
  taxpayerAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
  establishmentName: "Restaurante Pruebas",
  establishmentAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
  timezone: "Europe/Madrid",
  defaultVatRateBps: 1_000,
};

function liveReadyConfiguration() {
  const config = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: { ...input, mode: "live" as const } });
  config.software.producerNif = "B12345674";
  config.certificateSecretResource = "projects/p/secrets/cert/versions/1";
  config.responsibleDeclaration = {
    status: "published",
    declaredFiscalModuleVersion: HOSTLY_FISCAL_MODULE_VERSION,
    documentUrl: "https://hostlyapp.app/legal/declaracion-responsable.pdf",
    producerPostalAddress: "Madrid, España",
    signedAt: "2027-01-01",
    signedPlace: "Madrid, España",
  };
  return config;
}

test("separa obligado tributario, establecimiento e instalación", () => {
  const config = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: input });
  assert.match(config.taxEntityId, /^tax_[a-f0-9]{24}$/);
  assert.match(config.establishmentId, /^est_[a-f0-9]{24}$/);
  assert.equal(config.restaurantId, "restaurant-a");
  assert.equal(config.aeatEnvironment, "test");
  assert.equal(config.status, "draft");
  assert.notEqual(config.taxEntityId, config.restaurantId);
});

test("mantiene instalación al editar el mismo obligado", () => {
  const first = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: input });
  const second = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: { ...input, establishmentName: "Nuevo nombre" }, existing: first });
  assert.equal(second.software.installationNumber, first.software.installationNumber);
  assert.equal(second.establishmentId, first.establishmentId);
});

test("la activación exige productor y credencial configurados", () => {
  const config = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: input });
  assert.deepEqual(
    fiscalReadiness(config).filter((row) => !row.ready).map((row) => row.key),
    ["verifactu", "authorization", "declaration"],
  );
  assert.throws(() => assertFiscalConfigurationCanActivate(config, "test"), /FISCAL_CONFIGURATION_INCOMPLETE/);
});

test("no permite activar producción antes de la fecha mínima", () => {
  const config = liveReadyConfiguration();
  const previousActivation = process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED;
  const previousSubmission = process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
  process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED = "true";
  process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED = "true";
  try {
    assert.throws(
      () => assertFiscalConfigurationCanActivate(config, "live", Date.parse("2026-12-31T23:59:59+01:00")),
      /FISCAL_LIVE_NOT_YET_ALLOWED/,
    );
  } finally {
    if (previousActivation == null) delete process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED;
    else process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED = previousActivation;
    if (previousSubmission == null) delete process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
    else process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED = previousSubmission;
  }
});

test("live exige simultáneamente activación y envío AEAT habilitados", () => {
  const config = liveReadyConfiguration();
  const previousActivation = process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED;
  const previousSubmission = process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
  const afterOpening = Date.parse("2027-01-01T00:00:00+01:00");
  try {
    process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED = "true";
    delete process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
    assert.throws(
      () => assertFiscalConfigurationCanActivate(config, "live", afterOpening),
      /FISCAL_AEAT_PRODUCTION_SUBMISSION_DISABLED/,
    );

    process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED = "true";
    assert.doesNotThrow(() => assertFiscalConfigurationCanActivate(config, "live", afterOpening));
  } finally {
    if (previousActivation == null) delete process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED;
    else process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED = previousActivation;
    if (previousSubmission == null) delete process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
    else process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED = previousSubmission;
  }
});

test("la representación verificada no sustituye el certificado mTLS", () => {
  const config = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: input });
  config.software.producerNif = "B12345674";
  config.representationVerifiedAt = "2026-09-06T00:00:00.000Z";
  const authorization = fiscalReadiness(config).find((row) => row.key === "authorization");
  assert.equal(authorization?.ready, false);
  assert.equal(authorization?.label, "Certificado de envío AEAT");
});
