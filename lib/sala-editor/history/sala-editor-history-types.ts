import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorHistoryActionKind =
  | "operational.create"
  | "operational.move"
  | "operational.resize"
  | "operational.delete"
  | "operational.duplicate"
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
  | "structural.create"
  | "structural.move"
  | "structural.resize"
  | "structural.delete"
  | "espacio.create"
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
