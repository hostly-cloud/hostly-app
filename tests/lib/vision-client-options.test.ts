import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveVisionClientOptions } from "../../lib/server/menu-imports/vision-client-options";

describe("resolveVisionClientOptions", () => {
  test("crea opciones explícitas para Vision con la cuenta server-side", () => {
    assert.deepEqual(
      resolveVisionClientOptions({
        projectId: " hostly-test ",
        clientEmail: " vision@hostly-test.iam.gserviceaccount.com ",
        privateKey: " -----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY----- ",
      }),
      {
        projectId: "hostly-test",
        credentials: {
          client_email: "vision@hostly-test.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        },
      },
    );
  });

  test("deja que Google use ADC cuando la cuenta explícita está incompleta", () => {
    assert.equal(
      resolveVisionClientOptions({
        projectId: "hostly-test",
        clientEmail: "",
        privateKey: "key",
      }),
      undefined,
    );
  });
});
