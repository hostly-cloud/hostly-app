import { readdir, readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const BASE_LOCALES = ["fr", "de", "it", "pt", "nl"];
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

function flatten(value, prefix = "", out = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out[next] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, next, out);
  }
  return out;
}

async function loadTsCatalog(locale) {
  const source = await readFile(`locales/${locale}.ts`, "utf8");
  const executable = source
    .replace(/^import[^\n]*\n/gm, "")
    .replace(new RegExp(`export const ${locale}: MessageTree\\s*=\\s*`), "globalThis.catalog = ");
  const sandbox = { catalog: null };
  vm.runInNewContext(executable, sandbox, { filename: `locales/${locale}.ts` });
  return flatten(sandbox.catalog);
}

function placeholders(value) {
  const found = [];
  for (const match of String(value ?? "").matchAll(PLACEHOLDER_RE)) found.push(match[1]);
  return [...new Set(found)].sort();
}

const es = await loadTsCatalog("es");
const en = await loadTsCatalog("en");
const canonicalKeys = new Set(Object.keys(es));
const files = (await readdir("locales/multilingual")).filter((name) => name.endsWith(".json") && name !== "en-fixes.json").sort();
const seen = new Map();
const errors = [];
const stats = [];

for (const file of files) {
  const bundle = JSON.parse(await readFile(`locales/multilingual/${file}`, "utf8"));
  let entries = 0;
  for (const [key, tuple] of Object.entries(bundle)) {
    entries += 1;
    if (!canonicalKeys.has(key)) errors.push({ type: "unknown-key", file, key });
    if (!Array.isArray(tuple) || tuple.length !== BASE_LOCALES.length) {
      errors.push({ type: "invalid-tuple", file, key, actualLength: Array.isArray(tuple) ? tuple.length : null });
      continue;
    }
    if (seen.has(key)) errors.push({ type: "duplicate-key", file, key, firstFile: seen.get(key) });
    else seen.set(key, file);

    const expected = placeholders(en[key] ?? es[key]);
    tuple.forEach((value, index) => {
      if (typeof value !== "string" || !value.trim()) {
        errors.push({ type: "blank-translation", file, key, locale: BASE_LOCALES[index] });
        return;
      }
      const actual = placeholders(value);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push({ type: "placeholder-mismatch", file, key, locale: BASE_LOCALES[index], expected, actual });
      }
    });
  }
  stats.push({ file, entries });
}

const report = {
  generatedAt: new Date().toISOString(),
  files: stats,
  translatedCanonicalKeys: seen.size,
  canonicalKeyCount: canonicalKeys.size,
  missingCanonicalKeys: [...canonicalKeys].filter((key) => !seen.has(key)).sort(),
  errorCount: errors.length,
  errors,
};

await writeFile("i18n-overlay-integrity.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`i18n overlays: ${seen.size}/${canonicalKeys.size} canonical keys translated; ${errors.length} integrity error(s)`);
for (const error of errors.slice(0, 100)) console.log(JSON.stringify(error));
if (errors.length) process.exitCode = 1;
