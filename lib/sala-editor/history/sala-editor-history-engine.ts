import {
  areSalaEditorDocumentsEqual,
  cloneSalaEditorDocument,
} from "@/lib/sala-editor/history/sala-editor-document-snapshot";
import type {
  SalaEditorHistoryActionKind,
  SalaEditorHistoryEngineOptions,
  SalaEditorHistoryEntry,
  SalaEditorHistoryStacks,
} from "@/lib/sala-editor/history/sala-editor-history-types";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

const DEFAULT_MAX_PAST = 100;
const DEFAULT_ESPACIO_UPDATE_DEBOUNCE_MS = 700;

function createHistoryEntry(
  kind: SalaEditorHistoryActionKind,
  document: SalaEditorDocument,
): SalaEditorHistoryEntry {
  return {
    id: `${kind}-${document.updatedAt}-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    committedAt: Date.now(),
    document: cloneSalaEditorDocument(document),
  };
}

/**
 * Motor de historial desacoplado (past / present / future).
 * `present` vive en React; aquí solo se gestionan pilas y transacciones de gesto.
 */
export class SalaEditorHistoryEngine {
  private past: SalaEditorHistoryEntry[] = [];
  private future: SalaEditorHistoryEntry[] = [];
  private transactionBaseline: SalaEditorDocument | null = null;
  private readonly maxPast: number;
  private readonly espacioUpdateDebounceMs: number;
  private espacioUpdateBaseline: SalaEditorDocument | null = null;
  private espacioUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private changeListener: (() => void) | null = null;

  constructor(options?: SalaEditorHistoryEngineOptions) {
    this.maxPast = options?.maxPast ?? DEFAULT_MAX_PAST;
    this.espacioUpdateDebounceMs =
      options?.espacioUpdateDebounceMs ?? DEFAULT_ESPACIO_UPDATE_DEBOUNCE_MS;
  }

  getStacks(): SalaEditorHistoryStacks {
    return {
      past: [...this.past],
      future: [...this.future],
      hasOpenTransaction: this.transactionBaseline != null,
    };
  }

  setChangeListener(listener: (() => void) | null): void {
    this.changeListener = listener;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(present: SalaEditorDocument): SalaEditorDocument | null {
    if (this.past.length === 0) return null;

    this.discardTransaction();
    this.clearEspacioUpdateSchedule();

    const target = this.past.pop()!;
    this.future.push(
      createHistoryEntry("history.navigation", present),
    );

    this.emitChange();
    return cloneSalaEditorDocument(target.document);
  }

  redo(present: SalaEditorDocument): SalaEditorDocument | null {
    if (this.future.length === 0) return null;

    this.discardTransaction();
    this.clearEspacioUpdateSchedule();

    const target = this.future.pop()!;
    this.past.push(
      createHistoryEntry("history.navigation", present),
    );

    this.emitChange();
    return cloneSalaEditorDocument(target.document);
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.transactionBaseline = null;
    this.clearEspacioUpdateSchedule();
    this.emitChange();
  }

  beginTransaction(baseline: SalaEditorDocument): void {
    this.transactionBaseline = cloneSalaEditorDocument(baseline);
  }

  discardTransaction(): void {
    this.transactionBaseline = null;
  }

  commitTransaction(
    kind: SalaEditorHistoryActionKind,
    current: SalaEditorDocument,
  ): void {
    if (!this.transactionBaseline) return;

    if (
      !areSalaEditorDocumentsEqual(this.transactionBaseline, current)
    ) {
      this.pushPast(createHistoryEntry(kind, this.transactionBaseline));
    }

    this.transactionBaseline = null;
  }

  recordCommit(
    kind: SalaEditorHistoryActionKind,
    previous: SalaEditorDocument,
    current: SalaEditorDocument,
  ): void {
    if (this.transactionBaseline) return;
    if (areSalaEditorDocumentsEqual(previous, current)) return;

    this.pushPast(createHistoryEntry(kind, previous));
  }

  scheduleEspacioUpdateCommit(
    previous: SalaEditorDocument,
    getCurrent: () => SalaEditorDocument,
  ): void {
    if (this.transactionBaseline) return;

    if (!this.espacioUpdateBaseline) {
      this.espacioUpdateBaseline = cloneSalaEditorDocument(previous);
    }

    if (this.espacioUpdateTimer) {
      clearTimeout(this.espacioUpdateTimer);
    }

    this.espacioUpdateTimer = setTimeout(() => {
      const baseline = this.espacioUpdateBaseline;
      this.espacioUpdateBaseline = null;
      this.espacioUpdateTimer = null;
      if (!baseline) return;

      const current = getCurrent();
      if (areSalaEditorDocumentsEqual(baseline, current)) return;

      this.pushPast(createHistoryEntry("espacio.update", baseline));
    }, this.espacioUpdateDebounceMs);
  }

  flushScheduledCommits(getCurrent: () => SalaEditorDocument): void {
    if (!this.espacioUpdateTimer || !this.espacioUpdateBaseline) return;

    clearTimeout(this.espacioUpdateTimer);
    const baseline = this.espacioUpdateBaseline;
    this.espacioUpdateBaseline = null;
    this.espacioUpdateTimer = null;

    const current = getCurrent();
    if (areSalaEditorDocumentsEqual(baseline, current)) return;

    this.pushPast(createHistoryEntry("espacio.update", baseline));
  }

  private pushPast(entry: SalaEditorHistoryEntry): void {
    this.past.push(entry);
    if (this.past.length > this.maxPast) {
      this.past.shift();
    }
    this.future = [];
    this.emitChange();
  }

  private emitChange(): void {
    this.changeListener?.();
  }

  private clearEspacioUpdateSchedule(): void {
    if (this.espacioUpdateTimer) {
      clearTimeout(this.espacioUpdateTimer);
      this.espacioUpdateTimer = null;
    }
    this.espacioUpdateBaseline = null;
  }
}
