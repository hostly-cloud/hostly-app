import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { selectNewSalaEspacioInNavigation } from "../../lib/sala-editor/navigation/editor-phase-routing";

describe("selectNewSalaEspacioInNavigation", () => {
  test("abre Base al crear un plano desde Operacion", () => {
    assert.deepEqual(
      selectNewSalaEspacioInNavigation(
        { phase: "operacion", selectedEspacioId: "floor-old" },
        "floor-new",
      ),
      { phase: "base", selectedEspacioId: "floor-new" },
    );
  });
});
