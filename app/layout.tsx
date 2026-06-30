import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import { SelectedTableProvider } from "@/context/SelectedTableContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://hostly.app");

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
      { url: "/branding/favicon.ico", sizes: "32x32" },
      { url: "/branding/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/symbol.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
      className={`${geistSans.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/branding/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/branding/apple-touch-icon.png" />
        <meta name="theme-color" content="#0B1220" />
      </head>
      <body className="min-h-full flex flex-col">
        <SelectedTableProvider>
          <Providers>{children}</Providers>
        </SelectedTableProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `,
          }}
        />
      </body>
    </html>
  );
}
