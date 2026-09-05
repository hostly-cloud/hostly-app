"use client";

import { getApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

const SERVICE_WORKER_URL = "/api/operations/notifications/service-worker";

export type OperationalPushStatus = {
  supported: boolean;
  permission: NotificationPermission | "unavailable";
  subscribed: boolean;
  providerReady: boolean;
};

function vapidKey(): string {
  return (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "").trim();
}

export async function readOperationalPushStatus(): Promise<OperationalPushStatus> {
  const browserSupported = typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && await isSupported().catch(() => false);
  if (!browserSupported) {
    return { supported: false, permission: "unavailable", subscribed: false, providerReady: false };
  }
  const response = await authenticatedApiFetch("/api/operations/notifications/push", { cache: "no-store" });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    subscribed?: boolean;
    provider?: { push?: boolean };
  } | null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: response.ok && payload?.ok === true && payload.subscribed === true,
    providerReady: response.ok && payload?.ok === true && payload.provider?.push === true,
  };
}

export async function activateOperationalPush(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador no admite notificaciones push");
  }
  if (!await isSupported()) throw new Error("Firebase Messaging no está disponible en este dispositivo");
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No se ha concedido permiso para notificaciones");
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  const messaging = getMessaging(getApp());
  const key = vapidKey();
  const token = await getToken(messaging, {
    serviceWorkerRegistration: registration,
    ...(key ? { vapidKey: key } : {}),
  });
  if (!token) throw new Error("No se pudo registrar este dispositivo para notificaciones");
  const response = await authenticatedApiFetch("/api/operations/notifications/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "subscribe", token }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error === "PUSH_PROVIDER_NOT_CONFIGURED"
      ? "Las notificaciones push todavía no están disponibles en este entorno"
      : "No se pudo registrar este dispositivo");
  }
}

export async function deactivateOperationalPush(): Promise<void> {
  const response = await authenticatedApiFetch("/api/operations/notifications/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unsubscribeAll" }),
  });
  if (!response.ok) throw new Error("No se pudo desactivar este dispositivo");
  if (typeof window === "undefined" || !("Notification" in window) || !await isSupported().catch(() => false)) return;
  if (Notification.permission !== "granted") return;
  const messaging = getMessaging(getApp());
  await deleteToken(messaging).catch(() => false);
}
