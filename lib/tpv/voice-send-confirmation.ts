export type TpvVoiceSendConfirmationState = "pending" | "success";

export type WaitForTpvVoiceSendConfirmationOptions = {
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_POLL_MS = 55;

export async function waitForTpvVoiceSendConfirmation(
  readState: () => TpvVoiceSendConfirmationState,
  options: WaitForTpvVoiceSendConfirmationOptions = {},
): Promise<boolean> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const pollMs = Math.max(1, options.pollMs ?? DEFAULT_POLL_MS);
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();

  while (now() - startedAt < timeoutMs) {
    if (readState() === "success") return true;
    await sleep(pollMs);
  }

  return readState() === "success";
}
