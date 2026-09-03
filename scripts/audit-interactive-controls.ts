import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type Counts = {
  canonicalButton: number;
  segmentedControl: number;
  formToggle: number;
  rowActions: number;
  nativeButton: number;
  nativeAnchor: number;
  nextLink: number;
  nativeSelect: number;
  nativeInputAction: number;
  nativeSummary: number;
  rawTab: number;
  customOnClick: number;
};

type FileAudit = Counts & {
  file: string;
  module: string;
  buttonVariants: Record<string, number>;
};

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components"];
const EXTENSIONS = new Set([".tsx", ".jsx"]);
const ACTION_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio"]);
const CANONICAL_CLICK_COMPONENTS = new Set([
  "HostlyButton",
  "HostlyFormToggle",
  "HostlyRowActionButton",
  "HostlyRowActions",
]);
const NATIVE_INTERACTIVE = new Set(["button", "a", "select", "input", "summary"]);

const emptyCounts = (): Counts => ({
  canonicalButton: 0,
  segmentedControl: 0,
  formToggle: 0,
  rowActions: 0,
  nativeButton: 0,
  nativeAnchor: 0,
  nextLink: 0,
  nativeSelect: 0,
  nativeInputAction: 0,
  nativeSummary: 0,
  rawTab: 0,
  customOnClick: 0,
});

function addCounts(target: Counts, source: Counts) {
  for (const key of Object.keys(target) as Array<keyof Counts>) {
    target[key] += source[key];
  }
}

function collectFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectFiles(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name))) result.push(absolute);
  }
  return result;
}

function moduleFor(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join("/");
  if (normalized.startsWith("components/ui/hostly/")) return "Design system";
  if (normalized.startsWith("components/productos/")) return "Productos";
  if (normalized.startsWith("components/kds/")) return "KDS";
  if (normalized.startsWith("components/mesas/")) return "Mesas / TPV";
  if (normalized.startsWith("components/map/")) return "Plano / Mesas";
  if (normalized.startsWith("components/inventario/")) return "Inventario";
  if (normalized.startsWith("components/carta/")) return "Carta";
  if (normalized.startsWith("components/analysis/")) return "Análisis";
  if (normalized.startsWith("components/dashboard/")) return "Dashboard / shell";
  if (normalized.startsWith("components/marketing/") || normalized.startsWith("app/(marketing)/")) return "Marketing";
  if (normalized.startsWith("components/auth/")) return "Autenticación";
  if (normalized.startsWith("components/onboarding/")) return "Onboarding";
  if (normalized.startsWith("components/assistant/")) return "Asistente";
  if (normalized.startsWith("components/operacion/")) return "Operación";

  const dashboardMatch = normalized.match(/^app\/dashboard\/([^/]+)/);
  if (dashboardMatch) return `Ruta dashboard: ${dashboardMatch[1]}`;
  if (normalized.startsWith("app/")) return "Rutas / app";
  if (normalized.startsWith("components/")) {
    const [, area] = normalized.split("/");
    return area ? `Componentes: ${area}` : "Componentes";
  }
  return "Otros";
}

function tagNameText(node: ts.JsxOpeningLikeElement, sourceFile: ts.SourceFile): string {
  return node.tagName.getText(sourceFile);
}

function attribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function literalAttributeValue(attr: ts.JsxAttribute | undefined): string | null {
  if (!attr?.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (
    ts.isJsxExpression(attr.initializer) &&
    attr.initializer.expression &&
    ts.isStringLiteral(attr.initializer.expression)
  ) {
    return attr.initializer.expression.text;
  }
  return null;
}

function isDesignSystemImplementation(relativePath: string): boolean {
  return relativePath.split(path.sep).join("/").startsWith("components/ui/hostly/");
}

function auditFile(file: string): FileAudit {
  const relative = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  const counts = emptyCounts();
  const buttonVariants: Record<string, number> = {};
  const designSystemImplementation = isDesignSystemImplementation(relative);

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagNameText(node, sourceFile);
      const onClick = attribute(node, "onClick");
      const role = literalAttributeValue(attribute(node, "role"));

      if (tag === "HostlyButton") {
        counts.canonicalButton += 1;
        const variant = literalAttributeValue(attribute(node, "variant")) ?? "default";
        buttonVariants[variant] = (buttonVariants[variant] ?? 0) + 1;
      } else if (tag === "HostlySegmentedControl") {
        counts.segmentedControl += 1;
      } else if (tag === "HostlyFormToggle") {
        counts.formToggle += 1;
      } else if (tag === "HostlyRowActions" || tag === "HostlyRowActionButton") {
        counts.rowActions += 1;
      } else if (tag === "button") {
        if (!designSystemImplementation) counts.nativeButton += 1;
      } else if (tag === "a") {
        counts.nativeAnchor += 1;
      } else if (tag === "Link") {
        counts.nextLink += 1;
      } else if (tag === "select") {
        counts.nativeSelect += 1;
      } else if (tag === "input") {
        const inputType = (literalAttributeValue(attribute(node, "type")) ?? "text").toLowerCase();
        if (ACTION_INPUT_TYPES.has(inputType)) counts.nativeInputAction += 1;
      } else if (tag === "summary") {
        counts.nativeSummary += 1;
      }

      if (role === "tab" && tag !== "HostlySegmentedControl") counts.rawTab += 1;

      if (
        onClick &&
        !NATIVE_INTERACTIVE.has(tag) &&
        !CANONICAL_CLICK_COMPONENTS.has(tag) &&
        tag !== "Link"
      ) {
        counts.customOnClick += 1;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    file: relative.split(path.sep).join("/"),
    module: moduleFor(relative),
    ...counts,
    buttonVariants,
  };
}

const files = SOURCE_ROOTS.flatMap((root) => collectFiles(path.join(ROOT, root)));
const audits = files.map(auditFile);
const total = emptyCounts();
const byModule = new Map<string, Counts>();
const variants: Record<string, number> = {};

for (const audit of audits) {
  addCounts(total, audit);
  const moduleCounts = byModule.get(audit.module) ?? emptyCounts();
  addCounts(moduleCounts, audit);
  byModule.set(audit.module, moduleCounts);
  for (const [variant, count] of Object.entries(audit.buttonVariants)) {
    variants[variant] = (variants[variant] ?? 0) + count;
  }
}

const rawDebt = (counts: Counts) =>
  counts.nativeButton + counts.rawTab + counts.customOnClick;

const migrationFiles = audits
  .filter((audit) => rawDebt(audit) > 0)
  .sort((a, b) => rawDebt(b) - rawDebt(a) || a.file.localeCompare(b.file));

const moduleRows = [...byModule.entries()]
  .filter(([, counts]) =>
    counts.canonicalButton +
      counts.nativeButton +
      counts.rawTab +
      counts.customOnClick +
      counts.segmentedControl +
      counts.formToggle +
      counts.rowActions >
    0,
  )
  .sort(([, a], [, b]) => rawDebt(b) - rawDebt(a));

const output = {
  filesScanned: audits.length,
  total,
  hostlyButtonVariants: variants,
  modules: Object.fromEntries(moduleRows),
  migrationFiles: migrationFiles.slice(0, 40).map((audit) => ({
    file: audit.file,
    module: audit.module,
    nativeButton: audit.nativeButton,
    rawTab: audit.rawTab,
    customOnClick: audit.customOnClick,
    canonicalButton: audit.canonicalButton,
  })),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(0);
}

console.log("\nHostly interactive controls audit");
console.log("=================================");
console.log(`TSX/JSX files scanned: ${audits.length}`);
console.log(`Canonical HostlyButton usages: ${total.canonicalButton}`);
console.log(`Hostly segmented controls: ${total.segmentedControl}`);
console.log(`Hostly form toggles: ${total.formToggle}`);
console.log(`Hostly row action usages: ${total.rowActions}`);
console.log(`Native <button> outside design-system internals: ${total.nativeButton}`);
console.log(`Raw role=\"tab\": ${total.rawTab}`);
console.log(`Custom non-interactive elements with onClick: ${total.customOnClick}`);
console.log(`Native <select>: ${total.nativeSelect}`);
console.log(`Action inputs (button/submit/reset/checkbox/radio): ${total.nativeInputAction}`);
console.log(`Next <Link>: ${total.nextLink}`);
console.log(`Native <a>: ${total.nativeAnchor}`);
console.log(`Native <summary>: ${total.nativeSummary}`);

console.log("\nHostlyButton variants");
console.log("---------------------");
for (const [variant, count] of Object.entries(variants).sort((a, b) => b[1] - a[1])) {
  console.log(`${variant.padEnd(16)} ${count}`);
}

console.log("\nMigration debt by module");
console.log("------------------------");
for (const [module, counts] of moduleRows) {
  console.log(
    `${module.padEnd(30)} debt=${String(rawDebt(counts)).padStart(4)}  nativeButton=${String(counts.nativeButton).padStart(4)}  rawTab=${String(counts.rawTab).padStart(3)}  customOnClick=${String(counts.customOnClick).padStart(3)}  canonical=${String(counts.canonicalButton).padStart(4)}`,
  );
}

console.log("\nTop files to migrate");
console.log("--------------------");
for (const audit of migrationFiles.slice(0, 40)) {
  console.log(
    `${String(rawDebt(audit)).padStart(3)}  ${audit.file}  (button=${audit.nativeButton}, tab=${audit.rawTab}, custom=${audit.customOnClick}, canonical=${audit.canonicalButton})`,
  );
}
