# Catalog product image live coverage

This corpus validates the real-world coverage of Hostly's assisted image search against Open Food Facts.

## Purpose

- Measure whether representative hospitality products return usable candidates.
- Separate strong matches, review-only matches, misses and provider errors.
- Verify expected brand, format, barcode and vintage signals when configured.
- Produce JSON and Markdown evidence before the integration is treated as operationally accepted.

This evaluation never attaches an image, approves an image or changes Firestore. It only performs read-only search requests.

## Execution

```bash
npm run eval:catalog-images:live
```

Useful options:

```bash
npm run eval:catalog-images:live -- --case coca-cola-zero-330
npm run eval:catalog-images:live -- --max-cases 4
npm run eval:catalog-images:live -- --output-dir artifacts/catalog-image-live-eval
npm run eval:catalog-images:live -- --strict
```

The evaluator enforces a minimum delay of 6.5 seconds between search requests. The delay cannot be reduced through the CLI. This keeps the run below the documented Open Food Facts search limit of 10 requests per minute.

## Result interpretation

- `strong`: Hostly's candidate is strong and every configured identity expectation passes.
- `review`: a candidate exists, but it still requires careful human verification.
- `miss`: no candidate survives Hostly's conservative ranking.
- `error`: Open Food Facts could not answer reliably, timed out or rate-limited the request.

A passing report only supports an assisted human workflow. It never enables automatic assignment or approval. `automaticUseAllowed` is permanently `false` in this evaluation contract.

## Dynamic external data

Open Food Facts is community-maintained. Coverage and product metadata can change independently of Hostly. Therefore:

- the live evaluation is manual, not part of normal pull-request CI;
- deterministic ranking and security tests remain in normal CI;
- live results are uploaded as workflow artifacts;
- low coverage is evidence for improving provider strategy, not a reason to weaken identity checks.
