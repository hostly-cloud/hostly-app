import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { SelectedTableProvider } from "@/context/SelectedTableContext";
import { getHostlyPublicSiteUrl } from "@/lib/hostly/public-site-url";
import "./globals.css";
import "@/components/sala-editor/panels/sala-operational-element-visual.shared.css";

const metadataBase = getHostlyPublicSiteUrl();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Hostly",
    template: "%s · Hostly",
  },
  description:
    "Hostly es el TPV rápido, intuitivo y estable para restaurantes: mesas, cocina, carta, inventario e IA en una sola plataforma.",
  applicationName: "Hostly",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hostly",
  },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/hostly-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/hostly-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Hostly",
    description:
      "TPV rápido, intuitivo y estable para restaurantes: mesas, cocina, carta, inventario e IA.",
    siteName: "Hostly",
    type: "website",
    images: [
      {
        url: "/branding/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hostly",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hostly",
    description:
      "TPV rápido, intuitivo y estable para restaurantes: mesas, cocina, carta, inventario e IA.",
    images: ["/branding/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${GeistSans.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" sizes="180x180" />
        <meta name="theme-color" content="#0B1220" />
      </head>
      <body className="min-h-full flex flex-col">
        <SelectedTableProvider>
          <Providers>{children}</Providers>
        </SelectedTableProvider>
        <Script id="hostly-service-worker" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator && window.isSecureContext) {
              window.addEventListener('load', function registerHostlyServiceWorker() {
                navigator.serviceWorker
                  .register('/sw.js', { updateViaCache: 'none' })
                  .then(function onRegistered(registration) {
                    registration.update().catch(function ignoreUpdateError() {});
                  })
                  .catch(function onRegistrationError(error) {
                    console.warn('[Hostly][PWA] Service worker registration failed', error);
                  });
              }, { once: true });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
