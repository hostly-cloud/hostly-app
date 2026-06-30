import type { Metadata } from "next";
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  title: "Hostly — Plataforma operativa para restaurantes",
  description:
    "Gestiona TPV, cocina, stock, reservas, compras, analytics e IA desde una sola plataforma premium para hostelería.",
  openGraph: {
    title: "Hostly — Plataforma operativa para restaurantes",
    description:
      "TPV, cocina, stock, reservas, compras, análisis e inteligencia artificial en una sola plataforma.",
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
    title: "Hostly — Plataforma operativa para restaurantes",
    description:
      "TPV, cocina, stock, reservas, compras, análisis e inteligencia artificial en una sola plataforma.",
    images: ["/branding/og-image.png"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
