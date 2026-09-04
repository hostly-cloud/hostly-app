import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { waitForTpvVoiceSendConfirmation } from "@/lib/tpv/voice-send-confirmation";

describe("waitForTpvVoiceSendConfirmation", () => {
  test("confirma solo cuando la UI del TPV alcanza el ACK de éxito", async () => {
    let nowMs = 0;
    const states = ["pending", "pending", "success"] as const;
    let index = 0;

    const confirmed = await waitForTpvVoiceSendConfirmation(
      () => states[Math.min(index, states.length - 1)]!,
      {
        timeoutMs: 1_000,
        pollMs: 10,
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
          index += 1;
        },
      },
    );

    assert.equal(confirmed, true);
  });

  test("no inventa éxito si la comanda nunca recibe ACK", async () => {
    let nowMs = 0;

    const confirmed = await waitForTpvVoiceSendConfirmation(
      () => "pending",
      {
        timeoutMs: 30,
        pollMs: 10,
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
        },
      },
    );

    assert.equal(confirmed, false);
  });
});
