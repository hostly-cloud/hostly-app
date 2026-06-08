/**
 * Auditoría read-only: borrador real "Segundos platos" vs parser con layout OCR.
 * Uso: npx tsx scripts/audit-segundos-platos-real.ts
 */
import fs from "node:fs";
import path from "node:path";

const MENU_IMPORT_DRAFTS_SUBCOLLECTION = "menuImportDrafts";

const EXPECTED = [
  { name: "Langostinos gratinados, servidos con salsa de chile verde", price: 33.0 },
  { name: "Chuletas de cordero al crujiente de hierbas finas, con tzatziki", price: 29.5 },
  { name: "Escalopes de cerdo al vino blanco", price: 17.5 },
  { name: "Filete de dorada a la plancha", price: 18.9 },
  { name: "Solomillo de ternera nacional a la parrilla con patatas fritas", price: 32.0 },
  {
    name: "Muslo deshuesado de pollo feliz al estragón servido con patatas al horno y verduras",
    price: 22.5,
  },
  { name: "Filete de lubina salvaje al horno", price: 32.5 },
  { name: "Estofado de ternera al vino tinto servido con tagliatelle", price: 25.5 },
];

function loadEnv() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const envPath = path.join(repoRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

async function main() {
  loadEnv();

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const { getMenuImportDraftAdmin } = await import("../lib/server/menu-imports/menu-import-draft-admin");
  const { extractMenuText } = await import("../lib/server/menu-imports/extract-menu-text");
  const { parseMenuText } = await import("../lib/server/menu-imports/parse-menu-text");

  const db = getHostlyFirestore();
  if (!db) throw new Error("Firestore Admin no configurado");

  const snap = await db.collectionGroup(MENU_IMPORT_DRAFTS_SUBCOLLECTION).get();
  const candidates: Array<{
    draftId: string;
    restaurantId: string;
    fileName: string | null;
    status: unknown;
    itemsLength: number;
    rawTextSnippet: string;
    score: number;
  }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const rawText = typeof data.rawText === "string" ? data.rawText : "";
    const items = Array.isArray(data.items) ? data.items : [];
    const itemNames = items.map((i: { name?: string }) => String(i?.name ?? "")).join(" ");
    const haystack = `${rawText}\n${itemNames}\n${data.originalFileName ?? ""}`.toLowerCase();

    let score = 0;
    if (haystack.includes("segundos platos")) score += 5;
    if (haystack.includes("hauptgerichte")) score += 4;
    if (haystack.includes("langostinos gratinados")) score += 6;
    if (haystack.includes("gratinados, servidos")) score += 3;
    if (haystack.includes("main courses")) score += 2;

    if (score >= 4) {
      candidates.push({
        draftId: doc.id,
        restaurantId: doc.ref.parent.parent?.id || "",
        fileName: typeof data.originalFileName === "string" ? data.originalFileName : null,
        status: data.status ?? null,
        itemsLength: items.length,
        rawTextSnippet: rawText.slice(0, 200),
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.itemsLength - a.itemsLength);

  if (candidates.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "No segundos platos draft found" }, null, 2));
    process.exit(1);
  }

  const pick = candidates[0];
  const draft = await getMenuImportDraftAdmin(db, pick.restaurantId, pick.draftId);
  if (!draft) throw new Error("Draft not readable");

  const extracted = await extractMenuText({
    sourceType: draft.sourceType,
    menuType: draft.menuType,
    storagePath: draft.storagePath,
    sourceUrl: draft.sourceUrl,
    originalFileName: draft.originalFileName,
  });

  const parsed = parseMenuText(extracted.rawText, {
    sourceType: draft.sourceType,
    menuType: draft.menuType,
    ocrLayoutLines: extracted.ocrLayoutLines,
    ocrPageWidth: extracted.ocrPageWidth,
    ocrPageHeight: extracted.ocrPageHeight,
  });

  const detected = parsed.items.map((item) => ({
    name: item.name,
    price: item.price ?? null,
    section: item.sectionName ?? null,
    selectedForPublish: item.selectedForPublish ?? null,
  }));

  const matches: Array<{ expected: string; found: string | null; priceOk: boolean }> = [];
  const used = new Set<number>();

  for (const exp of EXPECTED) {
    const expNorm = norm(exp.name);
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < detected.length; i++) {
      if (used.has(i)) continue;
      const dNorm = norm(detected[i]!.name);
      let s = 0;
      if (dNorm === expNorm) s = 100;
      else if (dNorm.includes(expNorm.slice(0, 20)) || expNorm.includes(dNorm.slice(0, 20))) s = 50;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 50) {
      used.add(bestIdx);
      const d = detected[bestIdx]!;
      matches.push({
        expected: exp.name,
        found: d.name,
        priceOk: d.price != null && pricesMatch(d.price, exp.price),
      });
    } else {
      matches.push({ expected: exp.name, found: null, priceOk: false });
    }
  }

  const wrongNames = detected.filter((d) => {
    const n = norm(d.name);
    return (
      /^gratinados/.test(n) ||
      /^de cordero/.test(n) ||
      /^con salsa/.test(n) ||
      /^pork /.test(n) ||
      /^baked /.test(n) ||
      /^gebackenes/.test(n) ||
      /^lamb chops/.test(n) ||
      /^prawns/.test(n)
    );
  });

  const report = {
    ok: true,
    draft: pick,
    allCandidates: candidates.slice(0, 5),
    storedDraftItems: (draft.items ?? []).map((i) => ({
      name: i.name,
      price: i.price ?? null,
      selectedForPublish: i.selectedForPublish ?? null,
    })),
    ocr: {
      rawTextLength: extracted.rawText.length,
      layoutLines: extracted.ocrLayoutLines?.length ?? 0,
      pageWidth: extracted.ocrPageWidth ?? null,
      pageHeight: extracted.ocrPageHeight ?? null,
      rawTextPreview: extracted.rawText.slice(0, 2500),
    },
    parser: {
      count: parsed.items.length,
      warnings: parsed.warnings,
      detected,
      wrongNames,
    },
    comparison: {
      expectedCount: EXPECTED.length,
      matchedCount: matches.filter((m) => m.found).length,
      allPricesOk: matches.every((m) => !m.found || m.priceOk),
      matches,
    },
  };

  const outDir = path.join(path.resolve(import.meta.dirname, ".."), "test-corpus", "cases", "segundos-platos-real");
  fs.mkdirSync(path.join(outDir, "input"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "input", "ocr.txt"), extracted.rawText, "utf8");
  if (extracted.ocrLayoutLines?.length) {
    fs.writeFileSync(
      path.join(outDir, "input", "ocr-layout.json"),
      JSON.stringify(
        {
          pageWidth: extracted.ocrPageWidth,
          pageHeight: extracted.ocrPageHeight,
          lines: extracted.ocrLayoutLines,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  report.savedCorpusDraft = "test-corpus/cases/segundos-platos-real/input/";
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
