"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { resolveTpvMenuGroup } from "@/lib/carta/tpv-menu-group";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { listTpvV2TableControllers } from "@/lib/tpv/v2-table-controller-registry";
import {
  normalizeTpvVoiceText,
  parseTpvVoiceCommand,
  scoreTpvVoiceCandidate,
  TPV_VOICE_COMMAND_EVENT,
  TPV_VOICE_FEEDBACK_EVENT,
  type TpvVoiceCommandDetail,
  type TpvVoiceFeedbackDetail,
  type TpvVoiceFeedbackTone,
  type TpvVoiceOrderItem,
} from "@/lib/tpv/voice-command";
import type { Product } from "@/types/product";

type Candidate<T> = {
  value: T;
  label: string;
  score: number;
};

const MATCH_MIN_SCORE = 0.72;
const MATCH_AMBIGUITY_GAP = 0.08;
const UI_WAIT_STEP_MS = 55;
const UI_WAIT_TIMEOUT_MS = 2400;

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

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitFor<T>(factory: () => T | null, timeoutMs = UI_WAIT_TIMEOUT_MS): Promise<T | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = factory();
    if (value != null) return value;
    await wait(UI_WAIT_STEP_MS);
  }
  return null;
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

async function clickProductWithQuantity(
  button: HTMLButtonElement,
  quantity: number,
): Promise<boolean> {
  const safeQuantity = Math.max(1, Math.min(50, Math.trunc(quantity)));
  if (safeQuantity === 1) {
    button.click();
    await wait(120);
    return true;
  }

  const trigger = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-preqty__trigger",
  );
  if (!trigger || trigger.disabled || !isVisible(trigger)) return false;

  trigger.click();
  const clearButton = await waitFor(() =>
    document.querySelector<HTMLButtonElement>(
      "#carta-tpv-quantity-pad [aria-label='Restablecer cantidad a una unidad']",
    ),
  );
  if (!clearButton) return false;
  clearButton.click();

  for (const digit of String(safeQuantity).split("")) {
    const digitButton = document.querySelector<HTMLButtonElement>(
      `#carta-tpv-quantity-pad [aria-label='Cantidad ${digit}']`,
    );
    if (!digitButton) return false;
    digitButton.click();
    await wait(45);
  }

  await wait(70);
  button.click();
  await wait(140);
  return true;
}

function findTable(query: string) {
  const entries = listTpvV2TableControllers();
  const candidates = entries.flatMap((entry) => [
    { value: entry, label: entry.tableLabel },
    { value: entry, label: entry.tableId },
    { value: entry, label: `mesa ${entry.tableLabel}` },
  ]);
  return chooseCandidate(query, candidates);
}

function executeOpenTable(query: string) {
  const match = findTable(query);
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

async function executeAddProduct(query: string, quantity: number) {
  const match = chooseCandidate(query, visibleProductButtons());
  if (match === "ambiguous") {
    emitFeedback("Hay varios productos parecidos. Di el nombre completo del producto.", "error");
    return;
  }
  if (!match) {
    emitFeedback(`No veo el producto “${query}” en la categoría actual.`, "error");
    return;
  }
  if (!(await clickProductWithQuantity(match.value, quantity))) {
    emitFeedback("No he podido preparar la cantidad indicada.", "error");
    return;
  }
  emitFeedback(
    quantity === 1
      ? `Añadido ${match.label}.`
      : `Añadidas ${quantity} unidades de ${match.label}.`,
    "success",
  );
}

function chooseCatalogProduct(query: string, products: Product[]) {
  return chooseCandidate(
    query,
    products.map((product) => ({ value: product, label: product.nombre })),
  );
}

async function selectProductCategory(product: Product): Promise<boolean> {
  const group = resolveTpvMenuGroup(product);
  const groupLabel = group === "bebida" ? "bebida" : "comida";
  const groupTab = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[role='tab']"),
  ).find(
    (button) =>
      !button.disabled &&
      isVisible(button) &&
      normalizeTpvVoiceText(button.textContent ?? "") === groupLabel,
  );
  if (groupTab && groupTab.getAttribute("aria-selected") !== "true") {
    groupTab.click();
    await wait(100);
  }

  const categoryName = product.categoria?.trim();
  if (categoryName) {
    const categoryButton = await waitFor(() =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button.carta-cat-btn")).find(
        (button) =>
          !button.disabled &&
          isVisible(button) &&
          normalizeTpvVoiceText(button.textContent ?? "") ===
            normalizeTpvVoiceText(categoryName),
      ) ?? null,
    );
    if (categoryButton && !categoryButton.classList.contains("carta-cat-btn--active")) {
      categoryButton.click();
      await wait(100);
    }
  }

  return Boolean(
    await waitFor(() =>
      visibleProductButtons().find(
        ({ label }) =>
          normalizeTpvVoiceText(label) === normalizeTpvVoiceText(product.nombre),
      )?.value ?? null,
    ),
  );
}

function modifierDialogOpen(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']")).some((dialog) => {
    const label = normalizeTpvVoiceText(dialog.getAttribute("aria-label") ?? "");
    return isVisible(dialog) && label.startsWith("opciones de ");
  });
}

async function addCatalogProduct(product: Product, quantity: number): Promise<"added" | "modifier" | "failed"> {
  if (!(await selectProductCategory(product))) return "failed";
  const button = visibleProductButtons().find(
    ({ label }) => normalizeTpvVoiceText(label) === normalizeTpvVoiceText(product.nombre),
  )?.value;
  if (!button) return "failed";
  if (!(await clickProductWithQuantity(button, quantity))) return "failed";
  if (modifierDialogOpen()) return "modifier";
  return "added";
}

function executeSendOrder(): boolean {
  const button = document.querySelector<HTMLButtonElement>(
    ".carta-tpv-payment-dock .carta-comanda-button",
  );
  if (!button || button.disabled || !isVisible(button)) {
    emitFeedback("No hay líneas de comanda listas para enviar.", "error");
    return false;
  }
  button.click();
  emitFeedback("Comanda enviada.", "success");
  return true;
}

async function executeProductsToTable(
  tableQuery: string,
  items: TpvVoiceOrderItem[],
  products: Product[],
) {
  if (products.length === 0) {
    emitFeedback("La carta todavía no está disponible. Prueba de nuevo en unos segundos.", "error");
    return;
  }

  const tableMatch = findTable(tableQuery);
  if (tableMatch === "ambiguous") {
    emitFeedback("Hay varias mesas parecidas. Di el número o nombre completo de la mesa.", "error");
    return;
  }
  if (!tableMatch) {
    emitFeedback(`No encuentro la mesa “${tableQuery}” en el plano actual.`, "error");
    return;
  }

  const resolvedItems: Array<{ product: Product; quantity: number }> = [];
  for (const item of items) {
    const productMatch = chooseCatalogProduct(item.productQuery, products);
    if (productMatch === "ambiguous") {
      emitFeedback(`Hay varios productos parecidos a “${item.productQuery}”. Di el nombre completo.`, "error");
      return;
    }
    if (!productMatch) {
      emitFeedback(`No encuentro “${item.productQuery}” en la carta activa.`, "error");
      return;
    }
    resolvedItems.push({ product: productMatch.value, quantity: item.quantity });
  }

  tableMatch.value.controller.onClick();
  emitFeedback(`Abriendo ${tableMatch.value.tableLabel} y preparando el pedido…`, "info");

  const ready = await waitFor(() => {
    const hasProducts = document.querySelector("button.carta-product-card");
    const hasComanda = document.querySelector(".carta-tpv-payment-dock");
    return hasProducts || hasComanda ? true : null;
  });
  if (!ready) {
    emitFeedback("La mesa se abrió, pero el TPV no terminó de cargar el pedido.", "error");
    return;
  }

  for (const { product, quantity } of resolvedItems) {
    const result = await addCatalogProduct(product, quantity);
    if (result === "failed") {
      emitFeedback(`No he podido añadir ${product.nombre}.`, "error");
      return;
    }
    if (result === "modifier") {
      emitFeedback(
        `${product.nombre} necesita opciones. Elige el formato o modificador; después di “enviar comanda”.`,
        "info",
      );
      return;
    }
  }

  await wait(220);
  if (!executeSendOrder()) return;
  const summary = resolvedItems
    .map(({ product, quantity }) => `${quantity} × ${product.nombre}`)
    .join(", ");
  emitFeedback(`${summary} · ${tableMatch.value.tableLabel} · enviado.`, "success");
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
  const { restaurantId } = useAuth();
  const operationalRestaurantId = resolveOperationalRestaurantId(restaurantId ?? null);
  const operationalCatalog = useCentralProductsForCarta(operationalRestaurantId, {
    scope: "tpv_menu",
  });

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
          void executeAddProduct(command.productQuery, command.quantity);
          break;
        case "add_products_to_table":
          void executeProductsToTable(
            command.tableQuery,
            command.items,
            operationalCatalog.products,
          );
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
            `No entiendo “${transcript}”. Prueba con “un carpaccio a mesa 3”, “dos Coca-Colas”, “enviar comanda” o “volver al mapa”.`,
            "error",
          );
      }
    };

    window.addEventListener(TPV_VOICE_COMMAND_EVENT, handler);
    return () => window.removeEventListener(TPV_VOICE_COMMAND_EVENT, handler);
  }, [operationalCatalog.products]);

  return null;
}
