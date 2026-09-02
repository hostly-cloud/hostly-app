"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { loadTpvEditorV2OperationalMap } from "@/lib/tpv/load-editor-v2-operational-map";

type TpvEditorV2ReadyGateProps = {
  restaurantId: string | null;
  children: ReactNode;
};

type GateStatus =
  | "loading"
  | "mounting"
  | "ready"
  | "missing"
  | "error"
  | "parity-error"
  | "interaction-error"
  | "viewport-error"
  | "visual-error";

const V2_RENDERER_MOUNT_TIMEOUT_MS = 10_000;
const V2_RENDERER_SELECTOR = '[data-hostly-readonly-map-source="editor-v2"]';
const V2_NATIVE_VIEWPORT_SELECTOR = '[data-hostly-v2-viewport="native"]';
const V2_COVERAGE_SELECTOR = "[data-hostly-v2-coverage]";
const V2_NATIVE_INTERACTION_VALUE = "native-v2";
const V2_OPERATIONAL_CONTROLLER_SELECTOR =
  '[data-hostly-v2-operational-instance-id][data-hostly-v2-table-id]';
const LEGACY_VISIBLE_TABLE_SELECTOR =
  '[data-hostly-tpv-legacy-table-overlay="legacy-fallback-visible"]';

export function hasUsableV2ViewportSize(width: number, height: number): boolean {
  return Number.isFinite(width) && width >= 32 && Number.isFinite(height) && height >= 32;
}

function LoadingV2MapState() {
  return (
    <div
      data-hostly-tpv-map-gate-loading
      className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500"
    >
      Cargando plano del Editor V2…
    </div>
  );
}

function allV2OperationalElementsHaveMemoryController(
  v2Map: HTMLElement,
): boolean {
  const operationalElements = v2Map.querySelectorAll<HTMLElement>(
    V2_OPERATIONAL_CONTROLLER_SELECTOR,
  );
  for (const element of operationalElements) {
    if (element.getAttribute("data-hostly-v2-controller") !== "memory") {
      return false;
    }
  }
  return true;
}

function hasRenderableV2Stage(
  v2Map: HTMLElement,
  nativeViewport: HTMLElement,
): boolean {
  const logicalWidth = Number(v2Map.getAttribute("data-hostly-v2-logical-width"));
  const logicalHeight = Number(v2Map.getAttribute("data-hostly-v2-logical-height"));
  const layerItems = Number(v2Map.getAttribute("data-hostly-v2-layer-items"));
  if (
    !Number.isFinite(logicalWidth) ||
    logicalWidth <= 0 ||
    !Number.isFinite(logicalHeight) ||
    logicalHeight <= 0 ||
    !Number.isFinite(layerItems) ||
    layerItems <= 0
  ) {
    return false;
  }

  const viewportRect = nativeViewport.getBoundingClientRect();
  if (!hasUsableV2ViewportSize(viewportRect.width, viewportRect.height)) {
    return false;
  }

  const rect = v2Map.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

export function TpvEditorV2ReadyGate({
  restaurantId,
  children,
}: TpvEditorV2ReadyGateProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [gateState, setGateState] = useState<{
    restaurantId: string;
    status: GateStatus;
  } | null>(null);
  const rid = restaurantId?.trim() ?? "";
  const status = rid && gateState?.restaurantId === rid
    ? gateState.status
    : "loading";
  const setStatus = useCallback(
    (nextStatus: GateStatus) => {
      if (!rid) return;
      setGateState({ restaurantId: rid, status: nextStatus });
    },
    [rid],
  );

  useEffect(() => {
    if (!rid) return;

    let cancelled = false;

    void loadTpvEditorV2OperationalMap(rid)
      .then((operationalMap) => {
        if (cancelled) return;
        setGateState({
          restaurantId: rid,
          status: operationalMap?.document ? "mounting" : "missing",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGateState({ restaurantId: rid, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [rid]);

  useEffect(() => {
    if (status !== "mounting") return;
    const host = hostRef.current;
    if (!host) return;

    let settled = false;
    const resolveV2MountState = () => {
      const v2Map = host.querySelector<HTMLElement>(V2_RENDERER_SELECTOR);
      if (!v2Map) return false;

      const coverage = host.querySelector<HTMLElement>(V2_COVERAGE_SELECTOR);
      if (!coverage) return false;
      if (coverage.getAttribute("data-hostly-v2-coverage") !== "complete") {
        settled = true;
        setStatus("parity-error");
        return true;
      }

      const nativeViewport = host.querySelector<HTMLElement>(
        V2_NATIVE_VIEWPORT_SELECTOR,
      );
      if (!nativeViewport || !nativeViewport.contains(v2Map)) {
        settled = true;
        setStatus("viewport-error");
        return true;
      }

      const visibleLegacyTable = host.querySelector(LEGACY_VISIBLE_TABLE_SELECTOR);
      if (visibleLegacyTable) {
        settled = true;
        setStatus("parity-error");
        return true;
      }

      const usesNativeV2Interaction =
        v2Map.getAttribute("data-hostly-readonly-map-interaction") ===
        V2_NATIVE_INTERACTION_VALUE;
      if (!usesNativeV2Interaction) {
        settled = true;
        setStatus("interaction-error");
        return true;
      }

      if (!allV2OperationalElementsHaveMemoryController(v2Map)) {
        return false;
      }

      if (!hasRenderableV2Stage(v2Map, nativeViewport)) {
        settled = true;
        setStatus("visual-error");
        return true;
      }

      settled = true;
      setStatus("ready");
      return true;
    };

    if (resolveV2MountState()) return;

    const observer = new MutationObserver(() => {
      if (resolveV2MountState()) observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true, attributes: true });

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      observer.disconnect();
      const coverage = host.querySelector<HTMLElement>(V2_COVERAGE_SELECTOR);
      if (
        coverage &&
        coverage.getAttribute("data-hostly-v2-coverage") !== "complete"
      ) {
        setStatus("parity-error");
        return;
      }
      const v2Map = host.querySelector<HTMLElement>(V2_RENDERER_SELECTOR);
      const nativeViewport = host.querySelector<HTMLElement>(
        V2_NATIVE_VIEWPORT_SELECTOR,
      );
      if (v2Map && (!nativeViewport || !nativeViewport.contains(v2Map))) {
        setStatus("viewport-error");
        return;
      }
      if (v2Map && !allV2OperationalElementsHaveMemoryController(v2Map)) {
        setStatus("interaction-error");
        return;
      }
      if (
        v2Map &&
        nativeViewport &&
        !hasRenderableV2Stage(v2Map, nativeViewport)
      ) {
        setStatus("visual-error");
        return;
      }
      setStatus("error");
    }, V2_RENDERER_MOUNT_TIMEOUT_MS);

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [setStatus, status]);

  if (status === "loading") {
    return <LoadingV2MapState />;
  }

  if (
    status === "missing" ||
    status === "error" ||
    status === "parity-error" ||
    status === "interaction-error" ||
    status === "viewport-error" ||
    status === "visual-error"
  ) {
    const isMissing = status === "missing";
    const isParityError = status === "parity-error";
    const isInteractionError = status === "interaction-error";
    const isViewportError = status === "viewport-error";
    const isVisualError = status === "visual-error";

    return (
      <div
        data-hostly-tpv-map-gate={
          isMissing
            ? "missing-v2"
            : isParityError
              ? "v2-parity-error"
              : isInteractionError
                ? "v2-interaction-error"
                : isViewportError
                  ? "v2-viewport-error"
                  : isVisualError
                    ? "v2-visual-error"
                    : "error-v2"
        }
        className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 px-6 text-center"
      >
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-900">
            {isMissing
              ? "Este restaurante todavía no tiene un plano disponible en Editor V2."
              : isParityError
                ? "El plano del TPV no coincide al 100 % con Editor V2."
                : isInteractionError
                  ? "Los elementos operativos del TPV todavía no están enlazados al 100 % con sus controladores V2."
                  : isViewportError
                    ? "El TPV todavía no está usando el viewport nativo del Editor V2."
                    : isVisualError
                      ? "El plano V2 se ha cargado, pero su escenario visual no tiene dimensiones o contenido renderizable."
                      : "No se ha podido montar el plano del Editor V2 en el TPV."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isParityError
              ? "Editor V2 todavía no cubre todo el contenido del plano operativo. Hostly bloquea el TPV en vez de volver a montar el mapa antiguo; completa o migra los elementos pendientes en Editor V2."
              : isInteractionError
                ? "Hostly ha bloqueado el mapa porque falta el controlador en memoria de algún elemento operativo V2 o el renderer no declaró interacción nativa."
                : isViewportError
                  ? "Hostly ha bloqueado la visualización porque el Editor V2 sigue montado dentro de un viewport histórico. El TPV solo se revela cuando renderer, interacción y viewport son V2 nativos."
                  : isVisualError
                    ? "Hostly ya no considera correcto un renderer V2 vacío o de tamaño cero. Revisa las dimensiones y las capas del espacio seleccionado."
                    : "El TPV ya no usa el mapa antiguo como sustituto. Revisa el enlace del plano y su estado en Editor V2."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      data-hostly-tpv-map-gate={status === "ready" ? "v2-ready" : "mounting-v2"}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {status === "mounting" ? <LoadingV2MapState /> : null}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={
          status === "ready"
            ? undefined
            : { position: "absolute", inset: 0, visibility: "hidden" }
        }
      >
        {children}
      </div>
    </div>
  );
}
