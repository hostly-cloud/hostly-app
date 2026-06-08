"use client";

import { ActiveOperatorPicker } from "@/components/tpv/active-operator-picker";
import { useActiveOperator } from "@/components/tpv/active-operator-context";
import type { ReactNode } from "react";

export function ActiveOperatorGate({ children }: { children: ReactNode }) {
  const {
    ready,
    activeOperator,
    showPicker,
    pickerOptions,
    lastOperator,
    selectOperator,
  } = useActiveOperator();

  if (!ready) {
    return null;
  }

  if (showPicker || !activeOperator) {
    return (
      <ActiveOperatorPicker
        options={pickerOptions}
        lastOperator={lastOperator}
        onSelect={selectOperator}
      />
    );
  }

  return <>{children}</>;
}
