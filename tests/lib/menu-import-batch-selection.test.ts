import assert from "node:assert/strict";
import test from "node:test";
import {
  createMenuImportSingleFileList,
  dedupeMenuImportBatchFiles,
  moveMenuImportBatchFile,
  removeMenuImportBatchFile,
  sameMenuImportBatchFiles,
  validateMenuImportBatchSelection,
  type MenuImportClientFileLike,
} from "@/lib/carta/menu-import-client-batch";
import { MAX_MENU_IMPORT_SOURCE_FILES } from "@/lib/carta/menu-import-source-files";

function image(name: string, overrides: Partial<MenuImportClientFileLike> = {}): MenuImportClientFileLike {
  return {
    name,
    size: 1024,
    type: "image/jpeg",
    lastModified: 1,
    ...overrides,
  };
}

test("acepta varias imágenes y rechaza un PDF mezclado con otras páginas", () => {
  assert.deepEqual(validateMenuImportBatchSelection([image("1.jpg"), image("2.jpg")]), { ok: true });
  assert.deepEqual(
    validateMenuImportBatchSelection([
      image("1.jpg"),
      image("menu.pdf", { type: "application/pdf" }),
    ]),
    { ok: false, code: "MENU_IMPORT_BATCH_PDF_MIXED" },
  );
});

test("limita el lote al máximo canónico", () => {
  const files = Array.from({ length: MAX_MENU_IMPORT_SOURCE_FILES + 1 }, (_, index) => image(`${index}.jpg`, { lastModified: index }));
  assert.deepEqual(validateMenuImportBatchSelection(files), {
    ok: false,
    code: "MENU_IMPORT_BATCH_TOO_LARGE",
  });
});

test("deduplica una misma selección exacta sin eliminar páginas distintas", () => {
  const first = image("pagina.jpg", { size: 1000, lastModified: 12 });
  const duplicate = image("pagina.jpg", { size: 1000, lastModified: 12 });
  const different = image("pagina.jpg", { size: 1001, lastModified: 13 });
  const deduped = dedupeMenuImportBatchFiles([first, duplicate, different]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0], first);
  assert.equal(deduped[1], different);
});

test("detecta si un lote normalizado mantiene exactamente el mismo orden", () => {
  const first = image("1.jpg", { lastModified: 10 });
  const second = image("2.jpg", { lastModified: 11 });
  assert.equal(sameMenuImportBatchFiles([first, second], [first, second]), true);
  assert.equal(sameMenuImportBatchFiles([first, second], [second, first]), false);
  assert.equal(sameMenuImportBatchFiles([first], [first, second]), false);
});

test("crea un FileList mínimo de un archivo para sincronizar el primario sin DataTransfer", () => {
  const first = image("primaria.jpg");
  const list = createMenuImportSingleFileList(first);
  assert.equal(list.length, 1);
  assert.equal(list[0], first);
  assert.equal(list.item(0), first);
  assert.equal(list.item(1), null);
  assert.deepEqual(Array.from(list), [first]);
});

test("reordena y elimina páginas conservando un orden determinista", () => {
  const pages = ["uno", "dos", "tres"];
  assert.deepEqual(moveMenuImportBatchFile(pages, 2, -1), ["uno", "tres", "dos"]);
  assert.deepEqual(moveMenuImportBatchFile(pages, 0, -1), pages);
  assert.deepEqual(removeMenuImportBatchFile(pages, 1), ["uno", "tres"]);
});
