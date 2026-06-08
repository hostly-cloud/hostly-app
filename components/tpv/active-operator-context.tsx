"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildTpvOperatorPickerOptions } from "@/lib/tpv/active-operator-roster";
import {
  clearActiveOperatorSession,
  isActiveOperatorValidForRestaurant,
  readActiveOperatorSession,
  readLastOperatorForRestaurant,
  writeActiveOperatorSession,
  writeLastOperatorForRestaurant,
  type ActiveOperatorSession,
  type TpvOperatorPickerOption,
} from "@/lib/tpv/active-operator-session";

type ActiveOperatorContextValue = {
  ready: boolean;
  activeOperator: ActiveOperatorSession | null;
  showPicker: boolean;
  pickerOptions: TpvOperatorPickerOption[];
  lastOperator: { id: string; name: string } | null;
  selectOperator: (option: TpvOperatorPickerOption) => void;
  requestOperatorChange: () => void;
};

const ActiveOperatorContext = createContext<ActiveOperatorContextValue | null>(
  null,
);

export function ActiveOperatorProvider({
  restaurantId,
  children,
}: {
  restaurantId: string | null;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [activeOperator, setActiveOperator] =
    useState<ActiveOperatorSession | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [pickerOptions, setPickerOptions] = useState<TpvOperatorPickerOption[]>(
    [],
  );
  const [lastOperator, setLastOperator] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const restaurantIdTrimmed = restaurantId?.trim() ?? "";

  const syncFromStorage = useCallback(() => {
    setPickerOptions(buildTpvOperatorPickerOptions());
    setLastOperator(readLastOperatorForRestaurant(restaurantIdTrimmed));

    const stored = readActiveOperatorSession();
    if (isActiveOperatorValidForRestaurant(stored, restaurantIdTrimmed)) {
      setActiveOperator(stored);
      setShowPicker(false);
      return;
    }

    if (stored) {
      clearActiveOperatorSession();
    }
    setActiveOperator(null);
    setShowPicker(true);
  }, [restaurantIdTrimmed]);

  useEffect(() => {
    syncFromStorage();
    setReady(true);
  }, [syncFromStorage]);

  useEffect(() => {
    if (!ready) return;
    syncFromStorage();
  }, [ready, restaurantIdTrimmed, syncFromStorage]);

  const selectOperator = useCallback(
    (option: TpvOperatorPickerOption) => {
      if (!restaurantIdTrimmed) return;
      const next: ActiveOperatorSession = {
        activeOperatorId: option.id,
        activeOperatorName: option.name,
        activeOperatorRole: option.role,
        selectedAt: Date.now(),
        restaurantId: restaurantIdTrimmed,
      };
      writeActiveOperatorSession(next);
      writeLastOperatorForRestaurant(restaurantIdTrimmed, option);
      setActiveOperator(next);
      setLastOperator({ id: option.id, name: option.name });
      setShowPicker(false);
    },
    [restaurantIdTrimmed],
  );

  const requestOperatorChange = useCallback(() => {
    clearActiveOperatorSession();
    setActiveOperator(null);
    setPickerOptions(buildTpvOperatorPickerOptions());
    setLastOperator(readLastOperatorForRestaurant(restaurantIdTrimmed));
    setShowPicker(true);
  }, [restaurantIdTrimmed]);

  const value = useMemo(
    () => ({
      ready,
      activeOperator,
      showPicker,
      pickerOptions,
      lastOperator,
      selectOperator,
      requestOperatorChange,
    }),
    [
      ready,
      activeOperator,
      showPicker,
      pickerOptions,
      lastOperator,
      selectOperator,
      requestOperatorChange,
    ],
  );

  return (
    <ActiveOperatorContext.Provider value={value}>
      {children}
    </ActiveOperatorContext.Provider>
  );
}

export function useActiveOperator(): ActiveOperatorContextValue {
  const ctx = useContext(ActiveOperatorContext);
  if (!ctx) {
    throw new Error(
      "useActiveOperator debe usarse dentro de ActiveOperatorProvider",
    );
  }
  return ctx;
}
