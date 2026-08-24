"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadSalaEditorDraft } from "@/lib/sala-editor/persistence/sala-editor-draft-store";

type TpvEditorV2ReadyGateProps = {
  restaurantId: string | null;
  children: ReactNode;
};

type GateStatus = "loading" | "mounting" | "ready" | "missing" | "error";

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

    const revealWhenV2IsMounted = () => {
      const v2Map = host.querySelector('[data-hostly-readonly-map-source="editor-v2"]');
      if (!v2Map) return false;
      setStatus("ready");
      return true;
    };

    if (revealWhenV2IsMounted()) return;

    const observer = new MutationObserver(() => {
      if (revealWhenV2IsMounted()) observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true, attributes: true });

    return () => observer.disconnect();
  }, [status]);

  if (status === "loading") {
    return (
      <div
        data-hostly-tpv-map-gate="loading-v2"
        className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-sm text-slate-500"
      >
        Cargando plano del Editor V2…
      </div>
    );
  }

  if (status === "missing" || status === "error") {
    return (
      <div
        data-hostly-tpv-map-gate={status === "missing" ? "missing-v2" : "error-v2"}
        className="flex min-h-[320px] w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 px-6 text-center"
      >
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-slate-900">
            {status === "missing"
              ? "Este restaurante todavía no tiene un plano publicado en Editor V2."
              : "No se ha podido cargar el plano del Editor V2."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            El TPV ya no usa el mapa antiguo como sustituto. Revisa o publica el plano desde Editor V2.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      data-hostly-tpv-map-gate={status === "ready" ? "v2-ready" : "mounting-v2"}
      style={status === "ready" ? undefined : { visibility: "hidden" }}
    >
      {children}
    </div>
  );
}
