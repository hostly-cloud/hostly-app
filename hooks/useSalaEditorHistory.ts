"use client";

import { useCallback, useMemo, useRef } from "react";
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
};

export function useSalaEditorHistory(): {
  historyApi: SalaEditorHistoryApi;
} {
  const engineRef = useRef<SalaEditorHistoryEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SalaEditorHistoryEngine();
  }

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
    }),
    [
      beginTransaction,
      commitTransaction,
      discardTransaction,
      flushScheduledCommits,
      getStacks,
      recordCommit,
      reset,
      scheduleEspacioUpdateCommit,
    ],
  );

  return { historyApi };
}
