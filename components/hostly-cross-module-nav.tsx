"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  clearCrossNavPayload,
  QS_FOCUS,
  QS_RESTORE_FOCUS,
  QS_RESTORE_PANEL,
  stripComprasFocusFromQuery,
  stripRestoreQuery,
} from "@/lib/hostly/cross-module-nav";
import { useReturnNavigation } from "@/lib/hostly/use-return-navigation";

/**
 * Barra de retorno + scroll al registro en Compras cuando la entrada viene de otro módulo.
 * Debe renderizarse dentro de &lt;Suspense fallback={null}&gt;.
 */
export function HostlyComprasCrossNavClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const nav = useReturnNavigation();

  useEffect(() => {
    const focus = sp.get(QS_FOCUS);
    if (!focus) return;
    let skipScroll = false;
    const onceKey = `hostly.comprasInScroll:${pathname}:${focus}`;
    try {
      if (sessionStorage.getItem(onceKey)) skipScroll = true;
      else {
        sessionStorage.setItem(onceKey, "1");
        window.setTimeout(() => {
          try {
            sessionStorage.removeItem(onceKey);
          } catch {
            /* ignore */
          }
        }, 4000);
      }
    } catch {
      /* sin dedupe si sessionStorage falla */
    }
    if (!skipScroll) {
      const id = `hostly-compra-row-${focus}`;
      const run = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      requestAnimationFrame(run);
      setTimeout(run, 100);
      setTimeout(run, 280);
    }
    router.replace(stripComprasFocusFromQuery(pathname, sp), { scroll: false });
  }, [pathname, router, sp]);

  if (!nav) return null;
  const { ctx, backHref, dismiss } = nav;

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 11px",
        borderRadius: 10,
        border: "1px solid rgba(56, 189, 248, 0.22)",
        background: "rgba(8, 47, 73, 0.28)",
        marginBottom: 4,
      }}
    >
      <Link
        href={backHref}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#bae6fd",
          textDecoration: "none",
          lineHeight: 1.3,
        }}
      >
        {t(ctx.labelKey)}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        style={{
          border: "none",
          background: "transparent",
          color: "#64748b",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          padding: "4px 6px",
          flexShrink: 0,
        }}
      >
        {t("crossNav.dismissContext")}
      </button>
    </div>
  );
}

export type HostlyFacturasCrossNavRestoreProps = {
  onRestore: (focusId: string, openPanel: boolean) => void;
};

/**
 * Lee h_focus / h_panel al volver desde Compras (u otro módigo que use el mismo patrón).
 * Debe renderizarse dentro de &lt;Suspense fallback={null}&gt;.
 */
export function HostlyFacturasCrossNavRestore({ onRestore }: HostlyFacturasCrossNavRestoreProps) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const focusId = sp.get(QS_RESTORE_FOCUS);
    if (!focusId) return;
    const onceKey = `hostly.fcRestoreOnce:${pathname}:${focusId}:${sp.get(QS_RESTORE_PANEL) ?? ""}`;
    try {
      if (sessionStorage.getItem(onceKey)) return;
      sessionStorage.setItem(onceKey, "1");
      window.setTimeout(() => {
        try {
          sessionStorage.removeItem(onceKey);
        } catch {
          /* ignore */
        }
      }, 5000);
    } catch {
      /* continue without dedupe */
    }
    const openPanel = sp.get(QS_RESTORE_PANEL) === "1";
    onRestore(focusId, openPanel);
    clearCrossNavPayload();
    router.replace(stripRestoreQuery(pathname, sp), { scroll: false });
  }, [onRestore, pathname, router, sp]);

  return null;
}
