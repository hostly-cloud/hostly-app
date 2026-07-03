import type { Metadata } from "next";
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  title: "Hostly — Plataforma SaaS visual para hostelería",
  description:
    "Controla TPV, carta, mesas y operación desde un único sistema visual diseñado para restaurantes, terrazas, hoteles y negocios con varios espacios.",
  openGraph: {
    title: "Hostly — Plataforma SaaS visual para hostelería",
    description:
      "TPV, carta, mesas y operación conectados en una sola plataforma visual para hostelería.",
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
    title: "Hostly — Plataforma SaaS visual para hostelería",
    description:
      "TPV, carta, mesas y operación conectados en una sola plataforma visual para hostelería.",
    images: ["/branding/og-image.png"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
