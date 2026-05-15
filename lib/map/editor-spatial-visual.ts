/**
 * Estilos visuales opcionales para el editor de plano (configuración / espacios).
 * Sin persistencia: solo lectura del nombre de zona para sugerir atmósfera.
 */

export type SpatialAreaVisual = {
  /** Fondo de la zona (color plano o degradados CSS). */
  fill: string;
  border: string;
  labelTint: string;
  /** Placa detrás del título (contraste legible sobre el fill). */
  labelPlate: string;
};

function normZoneName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Atmósfera por palabras clave: cada zona como contenedor espacial distinto
 * (temperatura, profundidad, material sugerido) — siempre muy contenido.
 */
export function inferSpatialAreaVisual(zoneName: string): SpatialAreaVisual {
  const n = normZoneName(zoneName);
  if (n.includes("terraza") || n.includes("terrace") || n.includes("exterior"))
    return {
      fill: [
        "linear-gradient(178deg, rgba(250, 244, 232, 0.34) 0%, rgba(216, 201, 176, 0.22) 100%)",
      ].join(", "),
      border: "rgba(178, 150, 112, 0.42)",
      labelTint: "rgba(48, 42, 34, 0.92)",
      labelPlate: "rgba(255, 252, 245, 0.46)",
    };
  if (n.includes("piscina") || n.includes("pool"))
    return {
      fill: [
        "linear-gradient(172deg, rgba(72, 170, 220, 0.14) 0%, rgba(28, 95, 130, 0.12) 100%)",
      ].join(", "),
      border: "rgba(72, 160, 205, 0.32)",
      labelTint: "rgba(224, 242, 254, 0.96)",
      labelPlate: "rgba(8, 32, 48, 0.48)",
    };
  if (n.includes("cocktail") || n.includes("coctel"))
    return {
      fill: [
        "linear-gradient(162deg, rgba(58, 38, 92, 0.18) 0%, rgba(32, 22, 52, 0.16) 100%)",
      ].join(", "),
      border: "rgba(110, 80, 165, 0.34)",
      labelTint: "rgba(237, 233, 254, 0.96)",
      labelPlate: "rgba(12, 8, 22, 0.5)",
    };
  if (n.includes("vip"))
    return {
      fill: [
        "linear-gradient(158deg, rgba(32, 28, 22, 0.28) 0%, rgba(18, 16, 14, 0.3) 100%)",
      ].join(", "),
      border: "rgba(165, 138, 72, 0.34)",
      labelTint: "rgba(254, 249, 220, 0.94)",
      labelPlate: "rgba(8, 7, 5, 0.55)",
    };
  if (n.includes("lounge") || n.includes("rooftop") || n.includes("sky"))
    return {
      fill: "linear-gradient(155deg, rgba(88, 86, 140, 0.2) 0%, rgba(38, 36, 72, 0.18) 100%)",
      border: "rgba(129, 140, 248, 0.34)",
      labelTint: "rgba(224, 231, 255, 0.97)",
      labelPlate: "rgba(18, 16, 42, 0.52)",
    };
  if (n.includes("barra") || n.includes("bar "))
    return {
      fill: [
        "linear-gradient(180deg, rgba(72, 62, 54, 0.34) 0%, rgba(32, 28, 24, 0.36) 100%)",
      ].join(", "),
      border: "rgba(110, 98, 86, 0.48)",
      labelTint: "rgba(248, 250, 252, 0.98)",
      labelPlate: "rgba(10, 9, 8, 0.58)",
    };
  if (n.includes("interior") || n.includes("salon") || n.includes("sala"))
    return {
      fill: [
        "linear-gradient(165deg, rgba(238, 230, 216, 0.24) 0%, rgba(182, 171, 154, 0.18) 100%)",
      ].join(", "),
      border: "rgba(132, 120, 104, 0.36)",
      labelTint: "rgba(52, 45, 36, 0.92)",
      labelPlate: "rgba(255, 252, 245, 0.42)",
    };
  if (n.includes("jardin") || n.includes("garden") || n.includes("patio"))
    return {
      fill: "linear-gradient(170deg, rgba(70, 124, 86, 0.17) 0%, rgba(34, 74, 48, 0.15) 100%)",
      border: "rgba(92, 168, 116, 0.34)",
      labelTint: "rgba(220, 252, 231, 0.97)",
      labelPlate: "rgba(14, 36, 24, 0.42)",
    };
  if (n.includes("dj") || n.includes("cabina") || n.includes("escenario"))
    return {
      fill: "linear-gradient(145deg, rgba(90, 28, 38, 0.18) 0%, rgba(42, 16, 22, 0.16) 100%)",
      border: "rgba(220, 100, 120, 0.3)",
      labelTint: "rgba(255, 241, 242, 0.96)",
      labelPlate: "rgba(36, 12, 16, 0.5)",
    };
  return {
    fill: [
      "linear-gradient(165deg, rgba(236, 228, 214, 0.2) 0%, rgba(154, 144, 128, 0.16) 100%)",
    ].join(", "),
    border: "rgba(132, 124, 112, 0.34)",
    labelTint: "rgba(56, 49, 40, 0.92)",
    labelPlate: "rgba(255, 252, 245, 0.4)",
  };
}
