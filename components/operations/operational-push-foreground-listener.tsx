"use client";

import { useEffect } from "react";
import { getApp } from "firebase/app";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";

export function OperationalPushForegroundListener() {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return;
      if (Notification.permission !== "granted" || !await isSupported().catch(() => false)) return;
      if (cancelled) return;
      const messaging = getMessaging(getApp());
      unsubscribe = onMessage(messaging, (payload) => {
        const data = payload.data ?? {};
        const title = data.title || "Hostly · Alerta operativa";
        const body = data.body || "Hay una incidencia operativa que requiere atención.";
        void navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, {
          body,
          tag: data.incidentId ? `hostly-alert-${data.incidentId}-${data.stage || "active"}` : "hostly-operational-alert",
          data: { url: data.url || "/dashboard/operacion/activity/alerts" },
        })).catch(() => undefined);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}
