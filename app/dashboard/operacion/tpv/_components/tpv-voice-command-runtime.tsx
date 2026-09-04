"use client";

import { useEffect } from "react";
import { listTpvV2TableControllers } from "@/lib/tpv/v2-table-controller-registry";
import {
  parseTpvVoiceCommand,
  scoreTpvVoiceCandidate,
  TPV_VOICE_COMMAND_EVENT,
  TPV_VOICE_FEEDBACK_EVENT,
  type TpvVoiceCommandDetail,
  type TpvVoiceFeedbackDetail,
  type TpvVoiceFeedbackTone,
} from "@/lib/tpv/voice-command";

type Candidate<T> = {
  value: T;
  label: string;
  score: number;
};

const MATCH_MIN_SCORE = 0.72;
const MATCH_AMBIGUITY_GAP = 0.08;

function emitFeedback(message: string, tone: TpvVoiceFeedbackTone = "info") {
  const detail: TpvVoiceFeedbackDetail = { message, tone };
  window.dispatchEvent(
    new CustomEvent<TpvVoiceFeedbackDetail>(TPV_VOICE_FEEDBACK_EVENT, { detail }),
  );
}

function chooseCandidate<T>(
  query: string,
  values: Array<{ value: T; label: string }>,
): Candidate<T> | null | "ambiguous" {
  const ranked = values
    .map(({ value, label }) => ({
      value,
      label,
      score: scoreTpvVoiceCandidate(query, label),
    }))
    .filter((candidate) => candidate.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];
  if (second && best.score < 0.98 && best.score - second.score < MATCH_AMBIGUITY_GAP) {
    return "ambiguous";
  }
  return best;
}

function findButtonByText(pattern: RegExp): HTMLButtonElement | null {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
    if (button.disabled) continue;
    const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (pattern.test(text)) return button;
  }
  return null;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function visibleProductButtons(): Array<{ value: HTMLButtonElement; label: string }> {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button.carta-product-card"),
  )
    .filter((button) => !button.disabled && isVisible(button))
    .map((button) => {
      const label =
        button.querySelector<HTMLElement>(".carta-product-name")?.textContent?.trim() ?? "";
      return { value: button, label };
    })
    .filter((candidate) => candidate.label.length > 0);
}

function clickProduct(button: HTMLButtonElement, quantity: number) {
  const safeQuantity = Math.max(1, Math.min(50, Math.trunc(quantity)));
  for (let i = 0; i < safeQuantity; i += 1) {
    window.setTimeout(() => button.click(), i * 110);
  }
}

function executeOpenTable(query: string) {
  const entries = listTpvV2TableControllers();
  const candidates = entries.flatMap((entry) => [
    { value: entry, label: entry.tableLabel },
    { value: entry, label: entry.tableId },
    { value: entry, label: `mesa ${entry.tableLabel}` },
  ]);
  const match = chooseCandidate(query, candidates);
  if (match === "ambiguous") {
    emitFeedback("Hay varias mesas parecidas. Di el número o nombre completo de la mesa.", "error");
    return;
  }
  if (!match) {
    emitFeedback(`No encuentro la mesa “${query}” en el plano actual.`, "error");
    return;
  }
  match.value.controller.onClick();
  emitFeedback(`Abriendo ${match.value.tableLabel}.`, "success");
}

function executeAddProduct(query: string, quantity: number) {
  const match = chooseCandidate(query, visibleProductButtons());
  if (match === "ambiguous") {
    emitFeedback("Hay varios productos parecidos. Di el nombre completo del producto.", "error");
    return;
  }
  if (!match) {
    emitFeedback(`No veo el producto “${query}” en la categoría actual.`, "error");
    return;
  }
  clickProduct(match.value, quantity);
  emitFeedback(
    quantity === 1
      ? `Añadido ${match.label}.`
      : `Añadidas ${quantity} unidades de ${match.label}.`,
    "success",
  );
}

function executeSendOrder() {
  const button = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-payment-dock .carta-comanda-button",
  );
  if (!button || button.disabled || !isVisible(button)) {
    emitFeedback("No hay líneas de comanda listas para enviar.", "error");
    return;
  }
  button.click();
  emitFeedback("Comanda enviada.", "success");
}

function executeMarchCourse(course: "primeros" | "segundos" | "postres") {
  const singular = course === "primeros" ? "primero" : course === "segundos" ? "segundo" : "postre";
  const pattern = new RegExp(`^${singular}s?:\\s*\\d+\\s+pendientes de marchar$`, "i");
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => !candidate.disabled && pattern.test(candidate.getAttribute("aria-label") ?? ""),
  );
  if (!button) {
    emitFeedback(`No hay ${course} pendientes de marchar.`, "error");
    return;
  }
  button.click();
  emitFeedback(`Confirmación preparada para marchar ${course}.`, "info");
}

function executeConfirmMarch() {
  const dialog = document.querySelector<HTMLElement>("[role='dialog']");
  const button = dialog
    ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => !candidate.disabled && /^Marchar$/i.test(candidate.textContent?.trim() ?? ""),
      )
    : null;
  if (!button) {
    emitFeedback("No hay ninguna marcha pendiente de confirmar.", "error");
    return;
  }
  button.click();
  emitFeedback("Marcha confirmada.", "success");
}

function executeBackToMap() {
  const button = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-to-map-btn--prominent",
  );
  if (!button || button.disabled || !isVisible(button)) {
    emitFeedback("Ya estás en el mapa del TPV.", "info");
    return;
  }
  button.click();
  emitFeedback("Volviendo al mapa.", "success");
}

function executePreticket() {
  const button = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-dock-pre-ticket",
  );
  if (!button || button.disabled || !isVisible(button)) {
    emitFeedback("El pre-ticket no está disponible ahora mismo.", "error");
    return;
  }
  button.click();
  emitFeedback("Pre-ticket abierto.", "success");
}

function executeCharge() {
  const button = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-dock-cobrar",
  );
  if (!button || button.disabled || !isVisible(button)) {
    emitFeedback("No se puede abrir el cobro en este momento.", "error");
    return;
  }
  button.click();
  emitFeedback("Cobro abierto. Confirma el método y el importe en pantalla.", "info");
}

export function TpvVoiceCommandRuntime() {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TpvVoiceCommandDetail>).detail;
      const transcript = detail?.transcript?.trim() ?? "";
      if (!transcript) return;

      const command = parseTpvVoiceCommand(transcript);
      switch (command.type) {
        case "open_table":
          executeOpenTable(command.tableQuery);
          break;
        case "back_to_map":
          executeBackToMap();
          break;
        case "add_product":
          executeAddProduct(command.productQuery, command.quantity);
          break;
        case "send_order":
          executeSendOrder();
          break;
        case "march_course":
          executeMarchCourse(command.course);
          break;
        case "confirm_march":
          executeConfirmMarch();
          break;
        case "preticket":
          executePreticket();
          break;
        case "charge":
          executeCharge();
          break;
        default:
          emitFeedback(
            `No entiendo “${transcript}”. Prueba con “mesa 4”, “dos Coca-Colas”, “enviar comanda” o “volver al mapa”.`,
            "error",
          );
      }
    };

    window.addEventListener(TPV_VOICE_COMMAND_EVENT, handler);
    return () => window.removeEventListener(TPV_VOICE_COMMAND_EVENT, handler);
  }, []);

  return null;
}
