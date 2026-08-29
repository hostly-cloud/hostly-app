import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import {
  autoCorrectDuplicateOperationalTableNames,
  suggestOperationalElementInstanceName,
} from "@/lib/sala-editor/ose/operational-element-naming";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

function instance(id: string, spaceId: string, name: string): OperationalElementInstance {
  return {
    id,
    spaceId,
    zoneId: null,
    elementType: "TABLE",
    name,
    position: { x: 0, y: 0 },
    rotation: 0,
    capacity: 4,
    visible: true,
    enabled: true,
    metadata: {},
    state: "libre",
  };
}

describe("suggestOperationalElementInstanceName", () => {
  it("mantiene la numeración del primer espacio", () => {
    const suggestion = suggestOperationalElementInstanceName(
      [instance("s1", "sala", "Mesa 1")],
      "sala",
      "TABLE",
      "Sala",
    );
    assert.deepEqual(suggestion, {
      name: "Mesa 2",
      correctedFrom: null,
      spaceSuffix: null,
    });
  });

  it("autocorrige Terraza cuando el número ya existe en Sala", () => {
    const suggestion = suggestOperationalElementInstanceName(
      [instance("s1", "sala", "Mesa 1")],
      "terraza",
      "TABLE",
      "Terraza",
    );
    assert.deepEqual(suggestion, {
      name: "Mesa 1T",
      correctedFrom: "Mesa 1",
      spaceSuffix: "T",
    });
  });

  it("elige el siguiente código libre si el sufijo también existe", () => {
    const suggestion = suggestOperationalElementInstanceName(
      [
        instance("s1", "sala", "Mesa 1"),
        instance("t1", "terraza-a", "Mesa 1T"),
      ],
      "terraza-b",
      "TABLE",
      "Terraza exterior",
    );
    assert.equal(suggestion.name, "Mesa 1T2");
  });
});

describe("autoCorrectDuplicateOperationalTableNames", () => {
  it("conserva Sala y corrige las mesas posteriores de Terraza", () => {
    const base = createEmptySalaEditorDocument("restaurant-1");
    const result = autoCorrectDuplicateOperationalTableNames({
      ...base,
      espacios: [
        { id: "sala", name: "Sala" },
        { id: "terraza", name: "Terraza" },
      ] as typeof base.espacios,
      operationalElementInstances: [
        instance("s1", "sala", "Mesa 1"),
        instance("s2", "sala", "Mesa 2"),
        instance("t1", "terraza", "Mesa 1"),
        instance("t2", "terraza", "Mesa 2"),
      ],
    });
    assert.deepEqual(
      result.document.operationalElementInstances.map((item) => item.name),
      ["Mesa 1", "Mesa 2", "Mesa 1T", "Mesa 2T"],
    );
    assert.equal(result.corrections.length, 2);
  });
});
