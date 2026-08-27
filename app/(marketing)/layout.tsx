import type { Metadata } from "next";
import { MarketingAnalytics } from "@/components/marketing/marketing-analytics";
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hostlyapp.app"),
  title: "Hostly — Software TPV para restaurantes y hostelería",
  description:
    "Hostly conecta TPV, mesas, cocina, barra, reservas, carta, productos y pagos en una plataforma diseñada para restaurantes y servicio real.",
  keywords: [
    "TPV hostelería",
    "TPV restaurante",
    "software para restaurantes",
    "programa para restaurantes",
    "KDS restaurante",
    "gestión de comandas",
    "gestión de mesas",
    "reservas restaurante",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Hostly — El restaurante entero, bajo control",
    description:
      "TPV, cocina, barra, reservas, carta, productos y pagos conectados para trabajar al ritmo de un servicio real.",
    url: "https://hostlyapp.app",
    siteName: "Hostly",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: "/branding/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Hostly — software para restaurantes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hostly — El restaurante entero, bajo control",
    description:
      "TPV, cocina, barra, reservas, productos, analítica e IA para hostelería real.",
    images: ["/branding/og-image.svg"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MarketingAnalytics />
    </>
  );
}
