import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hostly",
    short_name: "Hostly",
    description:
      "TPV rápido, intuitivo y estable para restaurantes: mesas, cocina, carta, inventario e IA.",
    start_url: "/",
    icons: [
      {
        src: "/branding/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/branding/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/branding/symbol.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    theme_color: "#0B1220",
    background_color: "#F7FCFF",
    display: "standalone",
  };
}
