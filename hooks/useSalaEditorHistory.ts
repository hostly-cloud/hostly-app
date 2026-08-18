"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { SalaEditorHistoryEngine } from "@/lib/sala-editor/history/sala-editor-history-engine";
import type {
  SalaEditorHistoryActionKind,
  SalaEditorHistoryStacks,
} from "@/lib/sala-editor/history/sala-editor-history-types";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorHistoryApi = {
  enabled: true;
  beginTransaction: (baseline: SalaEditorDocument) => void;
  discardTransaction: () => void;
  commitTransaction: (
    kind: SalaEditorHistoryActionKind,
    current: SalaEditorDocument,
  ) => void;
  recordCommit: (
    kind: SalaEditorHistoryActionKind,
    previous: SalaEditorDocument,
    current: SalaEditorDocument,
  ) => void;
  scheduleEspacioUpdateCommit: (
    previous: SalaEditorDocument,
    getCurrent: () => SalaEditorDocument,
  ) => void;
  flushScheduledCommits: (getCurrent: () => SalaEditorDocument) => void;
  reset: () => void;
  getStacks: () => SalaEditorHistoryStacks;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: (present: SalaEditorDocument) => SalaEditorDocument | null;
  redo: (present: SalaEditorDocument) => SalaEditorDocument | null;
};

export function useSalaEditorHistory(): {
  historyApi: SalaEditorHistoryApi;
  historyRevision: number;
} {
  const engineRef = useRef<SalaEditorHistoryEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new SalaEditorHistoryEngine();
  }

  const [historyRevision, bumpHistoryRevision] = useReducer(
    (value: number) => value + 1,
    0,
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setChangeListener(() => {
      bumpHistoryRevision();
    });
    return () => {
      engine.setChangeListener(null);
    };
  }, []);

  const beginTransaction = useCallback((baseline: SalaEditorDocument) => {
    engineRef.current?.beginTransaction(baseline);
  }, []);

  const discardTransaction = useCallback(() => {
    engineRef.current?.discardTransaction();
  }, []);

  const commitTransaction = useCallback(
    (kind: SalaEditorHistoryActionKind, current: SalaEditorDocument) => {
      engineRef.current?.commitTransaction(kind, current);
    },
    [],
  );

  const recordCommit = useCallback(
    (
      kind: SalaEditorHistoryActionKind,
      previous: SalaEditorDocument,
      current: SalaEditorDocument,
    ) => {
      engineRef.current?.recordCommit(kind, previous, current);
    },
    [],
  );

  const scheduleEspacioUpdateCommit = useCallback(
    (
      previous: SalaEditorDocument,
      getCurrent: () => SalaEditorDocument,
    ) => {
      engineRef.current?.scheduleEspacioUpdateCommit(previous, getCurrent);
    },
    [],
  );

  const flushScheduledCommits = useCallback(
    (getCurrent: () => SalaEditorDocument) => {
      engineRef.current?.flushScheduledCommits(getCurrent);
    },
    [],
  );

  const reset = useCallback(() => {
    engineRef.current?.reset();
  }, []);

  const getStacks = useCallback((): SalaEditorHistoryStacks => {
    return (
      engineRef.current?.getStacks() ?? {
        past: [],
        future: [],
        hasOpenTransaction: false,
      }
    );
  }, []);

  const canUndo = useCallback((): boolean => {
    return engineRef.current?.canUndo() ?? false;
  }, []);

  const canRedo = useCallback((): boolean => {
    return engineRef.current?.canRedo() ?? false;
  }, []);

  const undo = useCallback(
    (present: SalaEditorDocument): SalaEditorDocument | null => {
      return engineRef.current?.undo(present) ?? null;
    },
    [],
  );

  const redo = useCallback(
    (present: SalaEditorDocument): SalaEditorDocument | null => {
      return engineRef.current?.redo(present) ?? null;
    },
    [],
  );

  const historyApi = useMemo(
    (): SalaEditorHistoryApi => ({
      enabled: true,
      beginTransaction,
      discardTransaction,
      commitTransaction,
      recordCommit,
      scheduleEspacioUpdateCommit,
      flushScheduledCommits,
      reset,
      getStacks,
      canUndo,
      canRedo,
      undo,
      redo,
    }),
    [
      beginTransaction,
      canRedo,
      canUndo,
      commitTransaction,
      discardTransaction,
      flushScheduledCommits,
      getStacks,
      recordCommit,
      redo,
      reset,
      scheduleEspacioUpdateCommit,
      undo,
    ],
  );

  return { historyApi, historyRevision };
}
