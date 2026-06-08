# Menu import evaluation corpus

Parser-only regression cases for `parseMenuText`. OCR snapshots are frozen in `input/ocr.txt` — no Vision, OpenAI, or Firestore in this phase.

## Quick start

```bash
npm run eval:menu-import
```

Single case:

```bash
npm run eval:menu-import -- --case pasta-casera-multilingual
```

JSON report:

```bash
npm run eval:menu-import -- --json
```

## Layout

```
test-corpus/
  manifest.json
  snapshots/baseline-parser.json   # committed reference metrics
  cases/<case-id>/
    case.json                      # metadata (sourceType, menuType, tags)
    input/ocr.txt                  # frozen OCR text
    expected/products.json         # ground truth (never weaken to pass tests)
```

## Cases (8)

| ID | Priority | Pattern |
|----|----------|---------|
| pasta-casera-multilingual | P0 | Multilingüe V1/V2 |
| croquetas-inline-monolingue | P0 | Inline nombre+precio |
| orecchiette-identical-translations | P0 | Traducciones idénticas |
| pizza-trilingue | P0 | Pizza trilingüe |
| pasta-risotti-previa | P0 | Pasta + risotto |
| carta-columnar-precios-derecha | P1 | Columna nombres/precios |
| bebida-cocktail-simple | P0 | Cócteles inline |
| vinos-con-varios-precios | P1 | Vinos copa/botella + «Reserva» en nombre |

## How to add a case

1. Create `cases/<kebab-case-id>/` with `case.json`, `input/ocr.txt`, `expected/products.json`.
2. Register the id in `manifest.json` → `cases[]`.
3. Run `npm run eval:menu-import -- --case <id>` until PASS.
4. Run full corpus: `npm run eval:menu-import`.
5. If metrics improved legitimately, update baseline (see below).

### `expected/products.json` rules

- List every product that **should** be detected (ground truth).
- Use `negativeProducts` for names that must **not** appear as products.
- Set `globalExpectations` (`minRecall`, `minPrecision`, `maxPendingNames`, …).
- **Never** remove products or lower thresholds just to make CI green — fix the parser instead.

## Interpreting FAIL

| Signal | Meaning |
|--------|---------|
| `FN: …` | Expected product not detected or price/section mismatch |
| `FP: …` | Extra detected product or `negativeProducts` hit |
| `pendingNames` | Names queued without price pairing |
| `recall < 100%` | Products lost vs ground truth |
| `precision < 100%` | False positives vs ground truth |
| `BASELINE REGRESSION` | Current run worse than `snapshots/baseline-parser.json` |

Exit code **1** on any case FAIL or baseline regression.

## Baseline snapshot

File: `test-corpus/snapshots/baseline-parser.json`

Every full corpus run compares against this file (unless `--skip-baseline-check` or `--case`).

### When to update baseline

Update **only** when:

- You **intentionally** fixed the parser and all cases PASS with **equal or better** metrics.
- You **added new cases** to the corpus (more `expected` products).

Command:

```bash
npm run eval:menu-import -- --write-baseline
```

Commit the updated `baseline-parser.json` in the same PR as parser/corpus changes.

**Do not** update baseline to hide a regression.

## CI

PRs that touch import paths run `.github/workflows/menu-import-eval.yml`:

- `lib/server/menu-imports/**`
- `lib/menu-import-eval/**`
- `scripts/eval-menu-import-corpus.ts`
- `test-corpus/**`
