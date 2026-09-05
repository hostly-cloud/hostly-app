import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["app", "components"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_SEGMENTS = [
  `${path.sep}locales${path.sep}`,
  `${path.sep}tests${path.sep}`,
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}.next${path.sep}`,
];

const SPANISH_CHARS = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;
const SPANISH_UI_WORDS = /\b(guardar|cancelar|eliminar|añadir|agregar|editar|nuevo|nueva|cargando|buscar|seleccionar|configuración|operación|gestión|análisis|producto|productos|pedido|pedidos|reserva|reservas|cocina|barra|coctelería|mesa|mesas|cliente|clientes|empleado|empleados|proveedor|proveedores|compra|compras|fecha|estado|nota|notas|factura|facturas|inventario|merma|mermas|escandallo|escandallos|cerrar|abrir|volver|continuar|confirmar|cobrar|pago|pagos|recargar|enviar|pendiente|preparado|servido|libre|ocupada|ocupado|comensal|comensales|categoría|categorías|familia|familias|restaurante|equipo|venta|ventas|rendimiento|hoy|ayer|semana|error|aviso|crear|actualizar|desactivar|activar|recibido|crítico|disponible|detalle|detalles|nombre|cantidad|precio|total|acción|acciones|motivo|unidad)\b/i;

const NON_UI_HINTS = [
  /^\s*(import|export)\b/,
  /^\s*\/\//,
  /^\s*\*/,
  /^\s*\/\*/,
  /(?:href|src|className|data-[\w-]+|id|key|path|pathname|route|collection|document|field|type|kind|capability)\s*[:=]/,
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function looksLikeVisibleCandidate(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (NON_UI_HINTS.some((pattern) => pattern.test(line))) return false;
  return SPANISH_CHARS.test(line) || SPANISH_UI_WORDS.test(line);
}

const findings = [];
for (const root of ROOTS) {
  const files = await walk(root);
  for (const file of files) {
    if (SKIP_SEGMENTS.some((segment) => file.includes(segment))) continue;
    const source = await readFile(file, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (!looksLikeVisibleCandidate(line)) return;
      findings.push({
        file: file.split(path.sep).join("/"),
        line: index + 1,
        text: line.trim().slice(0, 260),
      });
    });
  }
}

const byFile = Object.create(null);
for (const item of findings) {
  (byFile[item.file] ??= []).push(item);
}

const report = {
  generatedAt: new Date().toISOString(),
  candidateCount: findings.length,
  fileCount: Object.keys(byFile).length,
  findings,
};

await writeFile("i18n-hardcoded-audit.json", `${JSON.stringify(report, null, 2)}\n`);

console.log(`i18n audit: ${report.candidateCount} candidate line(s) across ${report.fileCount} file(s)`);
for (const [file, items] of Object.entries(byFile)) {
  console.log(`\n${file} (${items.length})`);
  for (const item of items) console.log(`  ${item.line}: ${item.text}`);
}
