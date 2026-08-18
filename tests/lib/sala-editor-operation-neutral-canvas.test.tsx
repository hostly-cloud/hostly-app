import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SalaEditorWorkspaceCanvas } from "../../components/sala-editor/panels/sala-editor-workspace-canvas";
import { createLocalEspacio } from "../../lib/sala-editor/preview/create-preview-espacios";
import { getOperationalElementCatalogItem } from "../../lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "../../lib/sala-editor/ose/operational-element-instance";

const espacio = createLocalEspacio({
  restaurantId: "restaurant-a",
  name: "QA Editor V2",
  tipo: "personalizado",
  color: "#315f7d",
  sortOrder: 0,
});

const table: OperationalElementInstance = {
  id: "table-1",
  spaceId: espacio.id,
  zoneId: null,
  elementType: "TABLE",
  name: "Mesa 1",
  position: { x: 120, y: 100 },
  rotation: 0,
  capacity: 4,
  visible: true,
  enabled: true,
  metadata: {},
  state: "libre",
};

function renderOperation(activeTool: boolean): string {
  return renderToStaticMarkup(
    <SalaEditorWorkspaceCanvas
      restaurantId="restaurant-a"
      phase="operacion"
      espacio={espacio}
      hasEspacios
      activeStructuralToolboxItem={null}
      activeOperationalCatalogItem={
        activeTool ? getOperationalElementCatalogItem("TABLE") : null
      }
      operationalElementInstances={[table]}
      onRequestCreateEspacio={() => undefined}
    />,
  );
}

test("Operación neutral mantiene visibles el canvas, la mesa y la ayuda no bloqueante", () => {
  const markup = renderOperation(false);

  assert.match(markup, /aria-label="Plano de mesas y servicio"/);
  assert.match(markup, /aria-label="Mesa 1"/);
  assert.match(markup, /Selecciona una mesa del plano o elige un elemento para colocarlo/);
  assert.doesNotMatch(markup, /Elige qué quieres colocar para el servicio/);
});

test("activar y finalizar la colocación conserva el mismo canvas operativo", () => {
  const placementMarkup = renderOperation(true);
  const neutralMarkupAfterFinish = renderOperation(false);

  assert.match(placementMarkup, /aria-label="Plano de mesas y servicio"/);
  assert.match(placementMarkup, /Haz clic sobre el plano para colocar una mesa/);
  assert.match(neutralMarkupAfterFinish, /aria-label="Plano de mesas y servicio"/);
  assert.match(neutralMarkupAfterFinish, /aria-label="Mesa 1"/);
});
