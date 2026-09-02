import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL(
    "../../components/productos/product-catalog-image-bulk-panel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const styles = readFileSync(
  new URL(
    "../../components/productos/product-catalog-image-bulk-panel.module.css",
    import.meta.url,
  ),
  "utf8",
);
const managementPage = readFileSync(
  new URL("../../components/productos/productos-management-page.tsx", import.meta.url),
  "utf8",
);

test("Productos exposes the Ultra catalog image completion action without replacing the approved table", () => {
  assert.equal(
    managementPage.match(/<ProductCatalogImageBulkPanel \/>/g)?.length,
    2,
  );
  assert.match(
    managementPage,
    /configCartaAdvancedOpen \?[\s\S]*?<nav className="hostly-productos-carta-advanced-nav[\s\S]*?<ProductCatalogImageBulkPanel \/>[\s\S]*?Importar IA[\s\S]*?<\/nav>/,
  );
  assert.match(
    managementPage,
    /import \{ ProductCatalogImageBulkPanel \} from "@\/components\/productos\/product-catalog-image-bulk-panel"/,
  );
  assert.doesNotMatch(managementPage, /import dynamic from "next\/dynamic"/);
  assert.match(component, /Completar imágenes/);
  assert.match(component, /Nada se publicará sin aprobación/);
  assert.doesNotMatch(component, /restaurantId\s*:/);
});

test("the bulk review surface has a bounded mobile layout without horizontal scrolling", () => {
  assert.match(styles, /width:\s*min\(760px, 100%\)/);
  assert.match(styles, /max-height:\s*min\(780px, calc\(100dvh - 36px\)\)/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.dialog \{[\s\S]*?width:\s*100%/,
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.summaryGrid,[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(styles, /min-width:\s*0/);
});
