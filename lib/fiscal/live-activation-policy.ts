export const HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO = "2027-01-01T00:00:00+01:00";
export const HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS = Date.parse(HOSTLY_FISCAL_LIVE_NOT_BEFORE_ISO);

export function assertFiscalLiveWindowOpen(nowMs = Date.now()): void {
  if (!Number.isFinite(nowMs) || nowMs < HOSTLY_FISCAL_LIVE_NOT_BEFORE_MS) {
    throw new Error("FISCAL_LIVE_NOT_YET_ALLOWED");
  }
}
