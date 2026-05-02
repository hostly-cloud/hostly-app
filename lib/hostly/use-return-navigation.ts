"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { CrossNavPayloadV1 } from "@/lib/hostly/cross-module-nav";
import {
  buildReturnUrlWithRestore,
  clearCrossNavPayload,
  resolveActiveCrossNav,
  stripIncomingCrossNavQuery,
} from "@/lib/hostly/cross-module-nav";

export type ReturnNavigationActive = {
  ctx: CrossNavPayloadV1;
  backHref: string;
  dismiss: () => void;
};

/**
 * Contexto de retorno cuando el usuario llegó a esta ruta desde otro módulo (query `hm_*` + sessionStorage).
 * Usar en barras "Volver a…" en Compras, Recepciones, etc.
 */
export function useReturnNavigation(): ReturnNavigationActive | null {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const ctx = useMemo(() => resolveActiveCrossNav(sp), [sp]);

  const backHref = useMemo(
    () => (ctx ? buildReturnUrlWithRestore(ctx.returnTo, ctx.focusId, ctx.openPanel) : ""),
    [ctx],
  );

  const dismiss = useCallback(() => {
    clearCrossNavPayload();
    router.replace(stripIncomingCrossNavQuery(pathname, sp), { scroll: false });
  }, [pathname, router, sp]);

  if (!ctx) return null;
  return { ctx, backHref, dismiss };
}
