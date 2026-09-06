"use client";

import { useEffect } from "react";
import { getHostlyAppCheckToken } from "@/lib/firebase/client";
import { createHostlyAppCheckFetch } from "@/lib/security/app-check-client";

type HostlyWindow = Window & {
  __hostlyOriginalFetch?: typeof window.fetch;
  __hostlyAppCheckFetchInstalled?: boolean;
};

/**
 * Installs a single same-origin fetch wrapper for Hostly browser API calls.
 * HMR-safe and fail-open until server-side App Check enforcement is explicitly enabled.
 */
export function AppCheckFetchInstaller() {
  useEffect(() => {
    const hostlyWindow = window as HostlyWindow;
    if (hostlyWindow.__hostlyAppCheckFetchInstalled) return;

    const originalFetch = window.fetch.bind(window);
    hostlyWindow.__hostlyOriginalFetch = originalFetch;
    window.fetch = createHostlyAppCheckFetch(
      originalFetch,
      getHostlyAppCheckToken,
      window.location.origin,
    ) as typeof window.fetch;
    hostlyWindow.__hostlyAppCheckFetchInstalled = true;

    return () => {
      if (hostlyWindow.__hostlyOriginalFetch === originalFetch) {
        window.fetch = originalFetch;
        hostlyWindow.__hostlyOriginalFetch = undefined;
        hostlyWindow.__hostlyAppCheckFetchInstalled = false;
      }
    };
  }, []);

  return null;
}
