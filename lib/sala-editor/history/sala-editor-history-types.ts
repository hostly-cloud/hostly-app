import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorHistoryActionKind =
  | "operational.create"
  | "operational.move"
  | "operational.resize"
  | "operational.delete"
  | "operational.duplicate"
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
