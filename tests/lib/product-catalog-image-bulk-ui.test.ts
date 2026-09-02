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
const candidateComponent = readFileSync(
  new URL(
    "../../components/productos/product-catalog-image-candidate-options.tsx",
    import.meta.url,
  ),
  "utf8",
);
const managementPage = readFileSync(
  new URL("../../components/productos/productos-management-page.tsx", import.meta.url),
  "utf8",
);
const apiClient = readFileSync(
  new URL("../../lib/productos/catalog-image-bulk-api.ts", import.meta.url),
  "utf8",
);

test("Productos exposes the Ultra catalog image completion action without replacing the approved table", () => {
  assert.equal(
    managementPage.match(/<ProductCatalogImageBulkPanel \/>/g)?.length,
    2,
  );
  assert.match(
    managementPage,
    /configCartaAdvancedOpen \?[\s\S]*?<nav className="hostly-productos-carta-advanced-nav[\s\S]*?Importar IA[\s\S]*?<\/nav>\s*<ProductCatalogImageBulkPanel \/>\s*\{renderCatalogFoodDrinkSegment\(true\)\}/,
  );
  assert.match(
    managementPage,
    /import \{ ProductCatalogImageBulkPanel \} from "@\/components\/productos\/product-catalog-image-bulk-panel"/,
  );
  assert.doesNotMatch(managementPage, /import dynamic from "next\/dynamic"/);
  assert.match(component, /Completar imágenes/);
  assert.match(component, /Nada se publicará sin aprobación/);
  assert.match(component, /Aprobar selección/);
  assert.match(component, /Confirmar publicación/);
  assert.match(candidateComponent, /Elige la coincidencia correcta/);
  assert.match(candidateComponent, /Ver ficha original/);
  assert.match(component, /selectedCatalogReferences/);
  assert.match(component, /validCatalogSelections/);
  assert.match(
    component,
    /Hostly adjuntará las coincidencias de catálogo elegidas y publicará/,
  );
  assert.match(component, /continúa en el servidor aunque cierres esta pantalla/);
  assert.match(component, /Pausado de forma segura tras varios fallos de conexión/);
  assert.match(component, /Reanuda cuando el servicio vuelva a estar disponible/);
  assert.doesNotMatch(component, /processNextCatalogImageBulkItem/);
  assert.doesNotMatch(component, /restaurantId\s*:/);
  assert.match(apiClient, /catalogSelections/);
  assert.doesNotMatch(
    apiClient,
    /catalogSelections[\s\S]{0,240}imageUrl/,
  );
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
  assert.match(styles, /\.resultCheckboxTarget[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(styles, /\.candidateSource[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.candidateContent[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.results \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.resultName,[\s\S]*?white-space:\s*normal/,
  );
});
