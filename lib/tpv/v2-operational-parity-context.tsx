"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

const TpvV2OperationalParityContext = createContext<ReadonlySet<string> | null>(
  null,
);

export function TpvV2OperationalParityProvider({
  operationalIds,
  children,
}: {
  operationalIds: ReadonlySet<string>;
  children: ReactNode;
}) {
  return (
    <TpvV2OperationalParityContext.Provider value={operationalIds}>
      {children}
    </TpvV2OperationalParityContext.Provider>
  );
}

export function useTpvV2OperationalParity(tableId: string): boolean {
  const ids = useContext(TpvV2OperationalParityContext);
  const normalized = String(tableId ?? "").trim();
  return normalized !== "" && ids?.has(normalized) === true;
}
