import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { waitForTpvVoiceSendConfirmation } from "@/lib/tpv/voice-send-confirmation";

describe("waitForTpvVoiceSendConfirmation", () => {
  test("confirma solo cuando la UI del TPV alcanza el ACK de éxito", async () => {
    let nowMs = 0;
    const states = ["pending", "pending", "success"] as const;
    let index = 0;
    const confirmed = await waitForTpvVoiceSendConfirmation(
      () => states[Math.min(index, states.length - 1)]!,
      { timeoutMs: 1_000, pollMs: 10, now: () => nowMs, sleep: async (ms) => { nowMs += ms; index += 1; } },
    );
    assert.equal(confirmed, true);
  });

  test("no inventa éxito si la comanda nunca recibe ACK", async () => {
    let nowMs = 0;
    const confirmed = await waitForTpvVoiceSendConfirmation(
      () => "pending",
      { timeoutMs: 30, pollMs: 10, now: () => nowMs, sleep: async (ms) => { nowMs += ms; } },
    );
    assert.equal(confirmed, false);
  });
});

describe("TPV voice runtime send contract", () => {
  const src = readFileSync("app/dashboard/operacion/tpv/_components/tpv-voice-command-runtime.tsx", "utf8");

  test("espera el estado is-success antes de anunciar enviado", () => {
    assert.match(src, /waitForTpvVoiceSendConfirmation/);
    assert.match(src, /classList\.contains\("is-success"\)/);
    assert.match(src, /if \(!confirmed\)/);
    assert.match(src, /await executeSendOrder\(false\)/);
  });
});
