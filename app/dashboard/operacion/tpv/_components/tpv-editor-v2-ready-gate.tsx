"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadTpvPublishedMapRuntime } from "@/lib/tpv/published-map-runtime";

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
  | "viewport-error";

const V2_RENDERER_MOUNT_TIMEOUT_MS = 10_000;
const V2_RENDERER_SELECTOR = '[data-hostly-readonly-map-source="editor-v2"]';
const V2_NATIVE_VIEWPORT_SELECTOR = '[data-hostly-v2-viewport="native"]';
const V2_COVERAGE_SELECTOR = "[data-hostly-v2-coverage]";
const V2_NATIVE_INTERACTION_VALUE = "native-v2";
const V2_OPERATIONAL_CONTROLLER_SELECTOR =
  '[data-hostly-v2-operational-instance-id][data-hostly-v2-table-id]';
const LEGACY_VISIBLE_TABLE_SELECTOR =
  '[data-hostly-tpv-legacy-table-overlay="legacy-fallback-visible"]';

function LoadingV2MapState() {
  return (
    <div
      data-hostly-tpv-map-gate-loading
      className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500"
    >
      Cargando plano operativo publicado…
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

export function TpvEditorV2ReadyGate({
  restaurantId,
  children,
}: TpvEditorV2ReadyGateProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<GateStatus>("loading");

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setStatus("loading");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    void loadTpvPublishedMapRuntime(rid)
      .then((runtime) => {
        if (cancelled) return;
        setStatus(runtime.contractCount > 0 ? "mounting" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

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
      setStatus("error");
    }, V2_RENDERER_MOUNT_TIMEOUT_MS);

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [status]);

  if (status === "loading") {
    return <LoadingV2MapState />;
  }

  if (
    status === "missing" ||
    status === "error" ||
    status === "parity-error" ||
    status === "interaction-error" ||
    status === "viewport-error"
  ) {
    const isMissing = status === "missing";
    const isParityError = status === "parity-error";
    const isInteractionError = status === "interaction-error";
    const isViewportError = status === "viewport-error";

    return (
      <div
        data-hostly-tpv-map-gate={
          isMissing
            ? "missing-published-map"
            : isParityError
              ? "v2-parity-error"
              : isInteractionError
                ? "v2-interaction-error"
                : isViewportError
                  ? "v2-viewport-error"
                  : "error-published-map"
        }
        className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 px-6 text-center"
      >
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-900">
            {isMissing
              ? "Este restaurante todavía no tiene un plano operativo publicado disponible."
              : isParityError
                ? "El plano publicado del TPV no tiene cobertura V2 completa."
                : isInteractionError
                  ? "Los elementos operativos del TPV todavía no están enlazados al 100 % con sus controladores V2."
                  : isViewportError
                    ? "El TPV todavía no está usando el viewport nativo del Editor V2."
                    : "No se ha podido montar el plano operativo publicado en el TPV."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isParityError
              ? "Hostly ha detectado residuos fuera del contrato publicado y bloquea el TPV en vez de recuperar un renderer antiguo. Revisa la publicación del Editor V2."
              : isInteractionError
                ? "Hostly ha bloqueado el mapa porque falta el controlador en memoria de algún elemento operativo V2 o el renderer no declaró interacción nativa."
                : isViewportError
                  ? "Hostly ha bloqueado la visualización porque el mapa publicado sigue montado fuera del viewport V2 nativo."
                  : "El TPV usa exclusivamente la proyección publicada de floorPlans, tables y zones; el borrador del editor no es una fuente operativa."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      data-hostly-tpv-map-gate={status === "ready" ? "v2-ready" : "mounting-v2"}
      className="relative"
    >
      {status === "mounting" ? <LoadingV2MapState /> : null}
      <div
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
