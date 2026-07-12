import type { Metadata } from "next";
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hostlyapp.app"),
  title: "Hostly — TPV SaaS para hostelería real",
  description:
    "Hostly conecta TPV táctil, mesas, comandas, carta, reservas y pagos para que restaurantes, bares y terrazas trabajen más rápido durante el servicio.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Hostly — TPV SaaS para hostelería real",
    description:
      "Opera sala, cocina y caja con menos fricción: TPV táctil, mesas, comandas, carta, reservas y pagos en una sola plataforma.",
    url: "https://hostlyapp.app",
    siteName: "Hostly",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: "/branding/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Hostly",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hostly — TPV SaaS para hostelería real",
    description:
      "TPV táctil, mesas, comandas, carta, reservas y pagos para hostelería real.",
    images: ["/branding/og-image.svg"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
