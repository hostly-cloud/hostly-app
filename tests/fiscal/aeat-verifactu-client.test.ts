import assert from "node:assert/strict";
import test from "node:test";
import {
  AEAT_VERIFACTU_ENDPOINTS,
  parseAeatSubmissionResponse,
  submitAeatVerifactu,
} from "../../lib/server/fiscal/aeat-verifactu-client";

const response = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="urn:test"><CSV>ABC123</CSV><DatosPresentacion><NIFPresentador>B12345674</NIFPresentador><TimestampPresentacion>2027-01-02T11:20:31+01:00</TimestampPresentacion></DatosPresentacion><TiempoEsperaEnvio>60</TiempoEsperaEnvio><EstadoEnvio>Correcto</EstadoEnvio><RespuestaLinea><EstadoRegistro>Correcto</EstadoRegistro></RespuestaLinea></sfR:RespuestaRegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;

test("interpreta la respuesta oficial sin depender de prefijos XML", () => {
  assert.deepEqual(parseAeatSubmissionResponse(response), {
    submissionStatus: "Correcto",
    recordStatus: "Correcto",
    csv: "ABC123",
    presenterNif: "B12345674",
    presentedAt: "2027-01-02T11:20:31+01:00",
    waitSeconds: 60,
    errorCode: null,
    errorDescription: null,
    duplicateStatus: null,
  });
});

test("usa el endpoint de pruebas oficial y transporta certificado sin registrarlo", async () => {
  let called = false;
  const result = await submitAeatVerifactu({
    environment: "test",
    xmlEnvelope: "<?xml version=\"1.0\"?><RegFactuSistemaFacturacion/>",
    certificate: { pfx: Buffer.alloc(100, 1), passphrase: "secret" },
    transport: async (input) => {
      called = true;
      assert.equal(input.url, AEAT_VERIFACTU_ENDPOINTS.test);
      assert.equal(input.certificate.passphrase, "secret");
      return { statusCode: 200, body: response };
    },
  });
  assert.equal(called, true);
  assert.equal(result.recordStatus, "Correcto");
});

test("producción permanece bloqueada por fecha o por interruptor", async () => {
  const previous = process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
  delete process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
  try {
    await assert.rejects(
      submitAeatVerifactu({
        environment: "production",
        xmlEnvelope: "<?xml version=\"1.0\"?><RegFactuSistemaFacturacion/>",
        certificate: { pfx: Buffer.alloc(100, 1), passphrase: "secret" },
        transport: async () => ({ statusCode: 200, body: response }),
      }),
      /FISCAL_LIVE_NOT_YET_ALLOWED|AEAT_PRODUCTION_SUBMISSION_DISABLED/,
    );
  } finally {
    if (previous == null) delete process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED;
    else process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED = previous;
  }
});
