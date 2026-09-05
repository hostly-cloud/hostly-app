import assert from "node:assert/strict";
import test from "node:test";
import { HOSTLY_B2B_IMPLEMENTATION_STATUS, requireConfiguredB2bAdapter } from "../../lib/fiscal/b2b-electronic-invoice";

test("mantiene factura electrónica B2B separada de VERI*FACTU hasta la especificación definitiva", () => {
  assert.equal(HOSTLY_B2B_IMPLEMENTATION_STATUS.enabled, false);
  assert.throws(() => requireConfiguredB2bAdapter(null), /B2B_EINVOICE_PROTOCOL_NOT_ENABLED/);
});
