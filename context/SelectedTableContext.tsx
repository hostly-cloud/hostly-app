"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Table } from "@/lib/firestore/tables";

type SelectedTableContextValue = {
  selectedTable: Table | null;
  setSelectedTable: Dispatch<SetStateAction<Table | null>>;
};

const SelectedTableContext = createContext<SelectedTableContextValue | null>(
  null,
);

export function SelectedTableProvider({ children }: { children: ReactNode }) {
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const value = useMemo(
    () => ({ selectedTable, setSelectedTable }),
    [selectedTable, setSelectedTable],
  );

  return (
    <SelectedTableContext.Provider value={value}>
      {children}
    </SelectedTableContext.Provider>
  );
}

export function useSelectedTable(): SelectedTableContextValue {
  const ctx = useContext(SelectedTableContext);
  if (!ctx) {
    throw new Error("useSelectedTable must be used within SelectedTableProvider");
  }
  return ctx;
}
