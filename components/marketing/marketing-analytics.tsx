"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type MarketingConsent = "granted" | "denied" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const CONSENT_STORAGE_KEY = "hostly_marketing_consent_v1";
const analyticsEnabled =
  process.env.NEXT_PUBLIC_MARKETING_ANALYTICS_ENABLED === "true";
const gaMeasurementId =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";

function readStoredConsent(): MarketingConsent {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
}

function persistConsent(value: Exclude<MarketingConsent, null>) {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // Tracking remains disabled if storage is unavailable.
  }
}

export function MarketingAnalytics() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<MarketingConsent>(null);
  const [hydrated, setHydrated] = useState(false);
  const firstTrackedPath = useRef<string | null>(null);

  const isConfigured =
    analyticsEnabled && Boolean(gaMeasurementId || metaPixelId);

  useEffect(() => {
    setHydrated(true);
    if (!isConfigured) return;
    setConsent(readStoredConsent());
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured || consent !== "granted") return;

    const currentPath = `${pathname}${window.location.search}`;

    // GA4/Meta send the initial page view when their scripts initialize.
    // Only emit explicit page views after App Router navigation.
    if (firstTrackedPath.current === null) {
      firstTrackedPath.current = currentPath;
      return;
    }

    if (firstTrackedPath.current === currentPath) return;
    firstTrackedPath.current = currentPath;

    window.gtag?.("event", "page_view", {
      page_path: currentPath,
      page_location: window.location.href,
      page_title: document.title,
    });
    window.fbq?.("track", "PageView");
  }, [consent, isConfigured, pathname]);

  if (!hydrated || !isConfigured) return null;

  const chooseConsent = (value: Exclude<MarketingConsent, null>) => {
    persistConsent(value);
    firstTrackedPath.current = null;
    setConsent(value);
  };

  return (
    <>
      {consent === "granted" && gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="hostly-ga4" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaMeasurementId)}, {
                anonymize_ip: true,
                send_page_view: true
              });
            `}
          </Script>
        </>
      ) : null}

      {consent === "granted" && metaPixelId ? (
        <Script id="hostly-meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){
              if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
              s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
            }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', ${JSON.stringify(metaPixelId)});
            fbq('track', 'PageView');
          `}
        </Script>
      ) : null}

      {consent === null ? (
        <div
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-[18px] border border-[color:var(--hostly-line-strong)] bg-white/95 p-4 shadow-2xl backdrop-blur md:flex md:items-center md:gap-5"
          role="dialog"
          aria-live="polite"
          aria-label="Preferencias de privacidad"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[color:var(--hostly-ink-strong)]">
              Privacidad y medición
            </p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--hostly-ink-muted)]">
              Usamos analítica y publicidad solo si lo aceptas. Nos ayuda a medir
              qué funciona en Hostly y a mejorar nuestras campañas.
            </p>
          </div>
          <div className="mt-3 flex shrink-0 gap-2 md:mt-0">
            <button
              type="button"
              onClick={() => chooseConsent("denied")}
              className="min-h-10 rounded-xl border border-[color:var(--hostly-line-strong)] bg-white px-4 text-sm font-semibold text-[color:var(--hostly-ink-strong)]"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => chooseConsent("granted")}
              className="min-h-10 rounded-xl bg-[color:var(--hostly-navy-deep)] px-4 text-sm font-semibold text-white"
            >
              Aceptar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConsent(null)}
          className="fixed bottom-3 left-3 z-[90] rounded-lg border border-[color:var(--hostly-line-strong)] bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--hostly-ink-muted)] shadow-sm backdrop-blur"
          aria-label="Cambiar preferencias de privacidad"
        >
          Privacidad
        </button>
      )}
    </>
  );
}
