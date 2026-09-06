import assert from "node:assert/strict";
import test from "node:test";
import { buildFiscalConfiguration } from "../../lib/fiscal/configuration";
import { fiscalLiveReadiness } from "../../lib/fiscal/live-readiness";
import { HOSTLY_FISCAL_MODULE_VERSION } from "../../lib/fiscal/version";

function liveReadyConfiguration() {
  const config = buildFiscalConfiguration({
    restaurantId: "restaurant-a",
    value: {
      mode: "live",
      taxpayerLegalName: "Restaurante Pruebas SL",
      taxpayerNif: "B12345674",
      taxpayerAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
      establishmentName: "Restaurante Pruebas",
      establishmentAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
      timezone: "Europe/Madrid",
      defaultVatRateBps: 1_000,
    },
  });
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

test("antes de 2027 informa fecha y flags como bloqueos sin activar nada", () => {
  const status = fiscalLiveReadiness(liveReadyConfiguration(), {
    nowMs: Date.parse("2026-12-31T23:59:59+01:00"),
    activationFlagEnabled: false,
    submissionFlagEnabled: false,
  });
  assert.equal(status.ready, false);
  assert.equal(status.dateGateOpen, false);
  assert.deepEqual(status.blockers, ["date", "activation_flag", "submission_flag"]);
});

test("desde la fecha mínima queda listo solo cuando configuración, entorno y ambos flags están listos", () => {
  const status = fiscalLiveReadiness(liveReadyConfiguration(), {
    nowMs: Date.parse("2027-01-01T00:00:00+01:00"),
    activationFlagEnabled: true,
    submissionFlagEnabled: true,
  });
  assert.equal(status.ready, true);
  assert.deepEqual(status.missingConfiguration, []);
  assert.deepEqual(status.blockers, []);
});

test("expone los huecos de configuración sin revelar la referencia del certificado", () => {
  const config = liveReadyConfiguration();
  config.certificateSecretResource = null;
  const status = fiscalLiveReadiness(config, {
    nowMs: Date.parse("2027-01-01T00:00:00+01:00"),
    activationFlagEnabled: true,
    submissionFlagEnabled: true,
  });
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingConfiguration, ["authorization"]);
  assert.deepEqual(status.blockers, ["configuration"]);
});
