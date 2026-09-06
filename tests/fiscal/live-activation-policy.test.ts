import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFiscalLiveWindowOpen,
  HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS,
} from "../../lib/fiscal/live-activation-policy";

test("bloquea fiscal real hasta el 1 de enero de 2027 en Madrid", () => {
  assert.throws(
    () => assertFiscalLiveWindowOpen(HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS - 1),
    /FISCAL_LIVE_NOT_YET_ALLOWED/,
  );
});

test("abre la ventana fiscal exactamente desde el 1 de enero de 2027", () => {
  assert.doesNotThrow(() => assertFiscalLiveWindowOpen(HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS));
  assert.doesNotThrow(() => assertFiscalLiveWindowOpen(HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS + 1));
});
