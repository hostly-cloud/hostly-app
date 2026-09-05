import { NextResponse } from "next/server";

function jsString(value: string | undefined): string {
  return JSON.stringify((value ?? "").trim()).replaceAll("<", "\\u003c");
}

export function GET() {
  const config = {
    apiKey: jsString(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: jsString(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: jsString(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: jsString(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: jsString(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: jsString(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };

  const source = `
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: ${config.apiKey},
  authDomain: ${config.authDomain},
  projectId: ${config.projectId},
  storageBucket: ${config.storageBucket},
  messagingSenderId: ${config.messagingSenderId},
  appId: ${config.appId}
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload && payload.data ? payload.data : {};
  const title = data.title || "Hostly · Alerta operativa";
  const body = data.body || "Hay una incidencia operativa que requiere atención.";
  self.registration.showNotification(title, {
    body,
    tag: data.incidentId ? "hostly-alert-" + data.incidentId + "-" + (data.stage || "active") : "hostly-operational-alert",
    renotify: true,
    data: { url: data.url || "/dashboard/operacion/activity/alerts" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification && event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/dashboard/operacion/activity/alerts";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(destination);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(destination);
    return undefined;
  })());
});
`;

  return new NextResponse(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
