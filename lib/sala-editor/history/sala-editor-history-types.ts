import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorHistoryActionKind =
  | "operational.create"
  | "operational.move"
  | "operational.resize"
  | "operational.delete"
  | "operational.duplicate"
  | "operational.rename"
  | "wall.create"
  | "wall.move"
  | "wall.resize"
  | "wall.delete"
  | "wall.duplicate"
  | "wallAttachment.create"
  | "wallAttachment.move"
  | "wallAttachment.delete"
  | "surface.create"
  | "surface.move"
  | "surface.resize"
  | "surface.delete"
  | "zone.create"
  | "zone.move"
  | "zone.resize"
  | "zone.delete"
  | "structural.create"
  | "structural.move"
  | "structural.resize"
  | "structural.delete"
  | "landscape.create"
  | "landscape.move"
  | "landscape.resize"
  | "landscape.delete"
  | "espacio.create"
  | "espacio.duplicate"
  | "espacio.reorder"
  | "espacio.update"
  | "history.navigation";

export type SalaEditorHistoryEntry = {
  id: string;
  kind: SalaEditorHistoryActionKind;
  committedAt: number;
  document: SalaEditorDocument;
};

export type SalaEditorHistoryStacks = {
  past: SalaEditorHistoryEntry[];
  future: SalaEditorHistoryEntry[];
  hasOpenTransaction: boolean;
};

export type SalaEditorHistoryEngineOptions = {
  maxPast?: number;
  espacioUpdateDebounceMs?: number;
};
