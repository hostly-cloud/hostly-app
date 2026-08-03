import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildBatchChunkLastOpContext,
  buildPublicationWriteLastOpContext,
  planPublisherWriteRemember,
  type PublisherWriteLike,
} from "@/lib/sala-editor/persistence/sala-editor-v2-publisher-write-context";

function makeWrite(
  overrides: Partial<PublisherWriteLike> & {
    path?: string;
    id?: string;
    parentPath?: string;
  } = {},
): PublisherWriteLike {
  const id = overrides.id ?? "t1";
  const parentPath = overrides.parentPath ?? "tables";
  const path = overrides.path ?? `${parentPath}/${id}`;
  return {
    ref: {
      path,
      id,
      parent: { path: parentPath },
    },
    data: overrides.data ?? {
      restaurantId: "rest-1",
      floorPlanId: "fp-1",
      x: 10,
      y: 20,
    },
    mode: overrides.mode ?? "update",
    diagnosticLabel: overrides.diagnosticLabel,
    existingRestaurantId:
      overrides.existingRestaurantId === undefined ? "rest-1" : overrides.existingRestaurantId,
  };
}

describe("planPublisherWriteRemember", () => {
  test("diagnostics=true → filas diagnósticas caras + remember vía rows", () => {
    const plan = planPublisherWriteRemember(true);
    assert.equal(plan.buildExpensiveDiagnosticRows, true);
    assert.equal(plan.rememberVia, "diagnostic-rows");
  });

  test("diagnostics=false → sin filas caras + remember ligero", () => {
    const plan = planPublisherWriteRemember(false);
    assert.equal(plan.buildExpensiveDiagnosticRows, false);
    assert.equal(plan.rememberVia, "light-write-context");
  });
});

describe("buildPublicationWriteLastOpContext", () => {
  test("write individual conserva collectionName, documentPath, payloadKeys y operación", () => {
    const write = makeWrite({
      path: "tables/mesa-9",
      id: "mesa-9",
      parentPath: "tables",
      mode: "setMerge",
      data: {
        restaurantId: "rest-1",
        type: "table",
        status: "free",
      },
    });

    const snapshot = buildPublicationWriteLastOpContext({
      write,
      restaurantId: "rest-1",
      operation: "setDoc",
      uid: "uid-ops",
    });

    assert.equal(snapshot.operation, "setDoc");
    assert.equal(snapshot.documentPath, "tables/mesa-9");
    assert.equal(snapshot.collectionName, "tables");
    assert.equal(snapshot.restaurantId, "rest-1");
    assert.equal(snapshot.uid, "uid-ops");
    assert.equal(snapshot.payloadRestaurantId, "rest-1");
    assert.equal(snapshot.existingRestaurantId, "rest-1");
    assert.deepEqual(snapshot.payloadKeys, ["restaurantId", "status", "type"]);
  });

  test("updateDoc conserva operación y existingRestaurantId nulo cuando aplica", () => {
    const write = makeWrite({
      mode: "update",
      existingRestaurantId: null,
      data: { restaurantId: "rest-2", x: 1 },
    });
    const snapshot = buildPublicationWriteLastOpContext({
      write,
      restaurantId: "rest-2",
      operation: "updateDoc",
      uid: null,
    });
    assert.equal(snapshot.operation, "updateDoc");
    assert.equal(snapshot.existingRestaurantId, null);
    assert.equal(snapshot.uid, null);
    assert.deepEqual(snapshot.payloadKeys, ["restaurantId", "x"]);
  });
});

describe("buildBatchChunkLastOpContext", () => {
  test("batch de un documento usa path concreto", () => {
    const chunk = [
      makeWrite({
        path: "zones/z1",
        id: "z1",
        parentPath: "zones",
        data: { restaurantId: "rest-1", name: "Terraza" },
      }),
    ];
    const snapshot = buildBatchChunkLastOpContext({
      chunk,
      restaurantId: "rest-1",
      uid: "uid-1",
    });
    assert.equal(snapshot.operation, "batch.commit");
    assert.equal(snapshot.documentPath, "zones/z1");
    assert.equal(snapshot.collectionName, "zones");
    assert.equal(snapshot.payloadRestaurantId, "rest-1");
    assert.deepEqual(snapshot.payloadKeys, ["name", "restaurantId"]);
  });

  test("batch multi-documento conserva chunk agregado y keys unidas", () => {
    const chunk = [
      makeWrite({
        path: "tables/a",
        id: "a",
        parentPath: "tables",
        data: { restaurantId: "rest-1", x: 1 },
      }),
      makeWrite({
        path: "tables/b",
        id: "b",
        parentPath: "tables",
        data: { restaurantId: "rest-1", y: 2, locked: true },
      }),
    ];
    const snapshot = buildBatchChunkLastOpContext({
      chunk,
      restaurantId: "rest-1",
      uid: "uid-1",
    });
    assert.equal(snapshot.operation, "batch.commit");
    assert.equal(snapshot.documentPath, "batch:2:documents");
    assert.equal(snapshot.collectionName, "tables");
    assert.equal(snapshot.payloadRestaurantId, null);
    assert.equal(snapshot.existingRestaurantId, null);
    assert.deepEqual(snapshot.payloadKeys, ["locked", "restaurantId", "x", "y"]);
  });
});

describe("contexto útil para catches (equivalente a getLastSalaEditorV2PublisherFirestoreOperation)", () => {
  test("diagnostics=false recuerda operación ligera suficiente tras error simulado", () => {
    const plan = planPublisherWriteRemember(false);
    assert.equal(plan.buildExpensiveDiagnosticRows, false);

    const write = makeWrite({
      path: "floorPlans/fp-1",
      id: "fp-1",
      parentPath: "floorPlans",
      data: { restaurantId: "rest-1", name: "Sala" },
    });

    // Antes del commit/write fallido se recordaría este snapshot.
    const lastFirestoreOperation = buildPublicationWriteLastOpContext({
      write,
      restaurantId: "rest-1",
      operation: "setDoc",
      uid: "uid-catch",
    });

    assert.equal(plan.rememberVia, "light-write-context");
    assert.ok(lastFirestoreOperation.documentPath);
    assert.ok(lastFirestoreOperation.collectionName);
    assert.equal(lastFirestoreOperation.restaurantId, "rest-1");
    assert.ok(lastFirestoreOperation.payloadKeys.includes("restaurantId"));
    assert.equal(lastFirestoreOperation.operation, "setDoc");
  });

  test("diagnostics=true planifica remember vía rows (contrato de logs existente)", () => {
    const plan = planPublisherWriteRemember(true);
    assert.equal(plan.buildExpensiveDiagnosticRows, true);
    assert.equal(plan.rememberVia, "diagnostic-rows");

    // El snapshot ligero sigue siendo válido si se necesitara; el path de dev
    // usa describePublicationWrite + rememberLastFirestoreWriteOperation.
    const batchOp = buildBatchChunkLastOpContext({
      chunk: [makeWrite()],
      restaurantId: "rest-1",
      uid: "uid-dev",
    });
    assert.equal(batchOp.operation, "batch.commit");
    assert.equal(batchOp.documentPath, "tables/t1");
  });

  test("no introduce console.* ni escrituras: builders son puro valor", () => {
    const logs: string[] = [];
    const original = {
      info: console.info,
      warn: console.warn,
      error: console.error,
      table: console.table,
      groupCollapsed: console.groupCollapsed,
      groupEnd: console.groupEnd,
    };
    console.info = (...args: unknown[]) => {
      logs.push(`info:${String(args[0])}`);
    };
    console.warn = (...args: unknown[]) => {
      logs.push(`warn:${String(args[0])}`);
    };
    console.error = (...args: unknown[]) => {
      logs.push(`error:${String(args[0])}`);
    };
    console.table = (...args: unknown[]) => {
      logs.push(`table:${String(args[0])}`);
    };
    console.groupCollapsed = (...args: unknown[]) => {
      logs.push(`group:${String(args[0])}`);
    };
    console.groupEnd = () => {
      logs.push("groupEnd");
    };

    try {
      planPublisherWriteRemember(false);
      buildPublicationWriteLastOpContext({
        write: makeWrite(),
        restaurantId: "rest-1",
        operation: "updateDoc",
        uid: null,
      });
      buildBatchChunkLastOpContext({
        chunk: [makeWrite(), makeWrite({ id: "t2", path: "tables/t2" })],
        restaurantId: "rest-1",
        uid: null,
      });
    } finally {
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.table = original.table;
      console.groupCollapsed = original.groupCollapsed;
      console.groupEnd = original.groupEnd;
    }

    assert.deepEqual(logs, []);
  });
});
