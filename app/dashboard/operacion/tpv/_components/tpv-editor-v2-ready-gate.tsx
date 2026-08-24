"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadSalaEditorDraft } from "@/lib/sala-editor/persistence/sala-editor-draft-store";

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
  | "parity-error";

const V2_RENDERER_MOUNT_TIMEOUT_MS = 10_000;
const V2_RENDERER_SELECTOR = '[data-hostly-readonly-map-source="editor-v2"]';
const LEGACY_VISIBLE_TABLE_SELECTOR =
  '[data-hostly-tpv-legacy-table-overlay="legacy-fallback-visible"]';

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

    void loadSalaEditorDraft(rid)
      .then((draft) => {
        if (cancelled) return;
        setStatus(draft?.document ? "mounting" : "missing");
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
      const v2Map = host.querySelector(V2_RENDERER_SELECTOR);
      if (!v2Map) return false;

      const visibleLegacyTable = host.querySelector(LEGACY_VISIBLE_TABLE_SELECTOR);
      settled = true;
      setStatus(visibleLegacyTable ? "parity-error" : "ready");
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

  if (status === "missing" || status === "error" || status === "parity-error") {
    const isMissing = status === "missing";
    const isParityError = status === "parity-error";

    return (
      <div
        data-hostly-tpv-map-gate={
          isMissing ? "missing-v2" : isParityError ? "v2-parity-error" : "error-v2"
        }
        className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 px-6 text-center"
      >
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-900">
            {isMissing
              ? "Este restaurante todavía no tiene un plano disponible en Editor V2."
              : isParityError
                ? "El plano del TPV no coincide al 100 % con Editor V2."
                : "No se ha podido montar el plano del Editor V2 en el TPV."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isParityError
              ? "Hay al menos una mesa operativa sin enlace válido a su instancia de Editor V2. El TPV ha bloqueado el mapa antiguo para evitar representar una distribución distinta."
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
