import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  "app/dashboard/carta/carta-page-content.tsx",
  "utf8",
);
const styles = readFileSync(
  "app/dashboard/operacion/tpv/tpv-map-modern.css",
  "utf8",
);

describe("TPV floor-plan switching UI", () => {
  it("usa el selector compacto explícito en el TPV embebido de cualquier viewport", () => {
    assert.match(
      source,
      /const useCompactTpvFloorPlanSelector =\s*cartaHeaderMobile \|\| embeddedInOperacion;/,
    );
    assert.match(
      source,
      /operationalFloorPlansForTpv\.length > 1 \? \(\s*useCompactTpvFloorPlanSelector \? \(/,
    );
    assert.match(
      source,
      /useCompactTpvFloorPlanSelector &&\s*tpvFloorPlanMenuOpen &&/,
    );
  });

  it("remonta el viewport al cambiar de plano para no conservar la capa visual anterior", () => {
    assert.match(
      source,
      /key=\{`tpv-plan-\$\{selectedTpvFloorPlanId \?\? "legacy"\}`\}/,
    );
  });

  it("mantiene compacto el selector explícito en tablet y escritorio", () => {
    assert.match(
      styles,
      /@media \(min-width: 768px\)[\s\S]*?data-carta-embedded="true"[\s\S]*?\.carta-tpv-floor-plan-trigger[\s\S]*?height: 24px !important;/,
    );
  });
});
