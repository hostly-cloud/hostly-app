import { readdir, readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const LOCALES = ["es", "en", "fr", "de", "it", "pt", "nl"];
const OVERLAY_LOCALES = ["fr", "de", "it", "pt", "nl"];

function flatten(value, prefix = "", out = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out[next] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, next, out);
  }
  return out;
}

async function loadCatalog(locale) {
  const source = await readFile(`locales/${locale}.ts`, "utf8");
  const executable = source
    .replace(/^import[^\n]*\n/gm, "")
    .replace(new RegExp(`export const ${locale}: MessageTree\\s*=\\s*`), "globalThis.catalog = ");
  const sandbox = { catalog: null };
  vm.runInNewContext(executable, sandbox, { filename: `locales/${locale}.ts` });
  return flatten(sandbox.catalog);
}

async function loadOverlays() {
  const result = Object.fromEntries(OVERLAY_LOCALES.map((locale) => [locale, {}]));
  let names = [];
  try {
    names = await readdir("locales/multilingual");
  } catch {
    return result;
  }
  const jsonNames = names.filter((name) => name.endsWith(".json"));
  for (const name of jsonNames) {
    const bundle = JSON.parse(await readFile(`locales/multilingual/${name}`, "utf8"));
    for (const [key, tuple] of Object.entries(bundle)) {
      if (!Array.isArray(tuple) || tuple.length !== OVERLAY_LOCALES.length) continue;
      OVERLAY_LOCALES.forEach((locale, index) => {
        const value = tuple[index];
        if (typeof value === "string" && value.trim()) result[locale][key] = value;
      });
    }
  }
  return result;
}

const catalogs = Object.fromEntries(
  await Promise.all(LOCALES.map(async (locale) => [locale, await loadCatalog(locale)])),
);
const overlays = await loadOverlays();
for (const locale of OVERLAY_LOCALES) {
  catalogs[locale] = { ...catalogs[locale], ...overlays[locale] };
}

const canonicalKeys = Object.keys(catalogs.es).sort();
const englishKeys = new Set(Object.keys(catalogs.en));
const locales = {};
for (const locale of LOCALES) {
  const keys = new Set(Object.keys(catalogs[locale]));
  const missing = canonicalKeys.filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !canonicalKeys.includes(key)).sort();
  const blank = [...keys].filter((key) => !String(catalogs[locale][key] ?? "").trim()).sort();
  locales[locale] = {
    keyCount: keys.size,
    missingCount: missing.length,
    missing,
    extraCount: extra.length,
    extra,
    blankCount: blank.length,
    blank,
  };
}

const englishMissingAgainstSpanish = canonicalKeys.filter((key) => !englishKeys.has(key));
const report = {
  generatedAt: new Date().toISOString(),
  canonicalLocale: "es",
  canonicalKeyCount: canonicalKeys.length,
  englishMissingAgainstSpanish,
  locales,
};

await writeFile("i18n-catalog-coverage.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`i18n effective catalogs: ${canonicalKeys.length} canonical key(s)`);
for (const locale of LOCALES) {
  const item = locales[locale];
  console.log(`${locale}: ${item.keyCount} keys, ${item.missingCount} missing, ${item.extraCount} extra, ${item.blankCount} blank`);
}
