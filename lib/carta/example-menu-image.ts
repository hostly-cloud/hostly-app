/** Genera un PNG de menú de demostración (sin red) para “Usar foto de ejemplo”. */
export function createExampleMenuImageFile(locale: "es" | "en"): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 520;
    canvas.height = 680;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("canvas"));
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 520, 680);
    g.addColorStop(0, "#0c1222");
    g.addColorStop(0.45, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 520, 680);

    ctx.strokeStyle = "rgba(251,191,36,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 480, 640);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 30px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(locale === "es" ? "CARTA · EJEMPLO" : "MENU · SAMPLE", 44, 68);

    ctx.fillStyle = "rgba(148,163,184,0.95)";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    const sub =
      locale === "es" ? "Captura simulada para probar la importación" : "Simulated capture to try import";
    ctx.fillText(sub, 44, 96);

    const lines: { text: string; header?: boolean }[] =
      locale === "es"
        ? [
            { text: "Entrantes", header: true },
            { text: "Ensaladilla rusa ........................ 8,50 €" },
            { text: "Principales", header: true },
            { text: "Hamburguesa premium .................. 12,90 €" },
            { text: "Bebidas", header: true },
            { text: "Coca-Cola ................................ 2,50 €" },
            { text: "Postres", header: true },
            { text: "Tiramisú ................................... 5,90 €" },
          ]
        : [
            { text: "Starters", header: true },
            { text: "Russian salad ........................... €8.50" },
            { text: "Mains", header: true },
            { text: "Premium burger ......................... €12.90" },
            { text: "Drinks", header: true },
            { text: "Cola ...................................... €2.50" },
            { text: "Desserts", header: true },
            { text: "Tiramisu .................................. €5.90" },
          ];
    let y = 140;
    for (const row of lines) {
      const isHeader = Boolean(row.header);
      ctx.fillStyle = isHeader ? "rgba(251,191,36,0.95)" : "#cbd5e1";
      ctx.font = isHeader ? "700 13px ui-sans-serif, system-ui, sans-serif" : "500 15px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(row.text, 44, y);
      y += isHeader ? 28 : 34;
    }

    ctx.fillStyle = "rgba(56,189,248,0.55)";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      locale === "es" ? "Hostly · imagen de demostración" : "Hostly · demo image",
      44,
      630,
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("blob"));
          return;
        }
        resolve(
          new File([blob], locale === "es" ? "menu-ejemplo-hostly.png" : "hostly-sample-menu.png", {
            type: "image/png",
          }),
        );
      },
      "image/png",
      0.92,
    );
  });
}
