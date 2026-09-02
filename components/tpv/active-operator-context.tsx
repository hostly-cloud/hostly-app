"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { buildTpvOperatorPickerOptions } from "@/lib/tpv/active-operator-roster";
import { clearOperacionTpvUrlParams } from "@/lib/tpv/clear-operacion-tpv-url";
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
const subscribeHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

type ActiveOperatorViewState = {
  restaurantId: string;
  activeOperator: ActiveOperatorSession | null;
  showPicker: boolean;
  pickerOptions: TpvOperatorPickerOption[];
  lastOperator: { id: string; name: string } | null;
};

function readActiveOperatorViewState(
  restaurantId: string,
): ActiveOperatorViewState {
  const stored = readActiveOperatorSession();
  const activeOperator = isActiveOperatorValidForRestaurant(
    stored,
    restaurantId,
  )
    ? stored
    : null;
  return {
    restaurantId,
    activeOperator,
    showPicker: activeOperator == null,
    pickerOptions: buildTpvOperatorPickerOptions(),
    lastOperator: readLastOperatorForRestaurant(restaurantId),
  };
}

export function ActiveOperatorProvider({
  restaurantId,
  children,
}: {
  restaurantId: string | null;
  children: ReactNode;
}) {
  const restaurantIdTrimmed = restaurantId?.trim() ?? "";
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const storedState = useMemo(
    () => readActiveOperatorViewState(restaurantIdTrimmed),
    [restaurantIdTrimmed],
  );
  const [selectedState, setSelectedState] =
    useState<ActiveOperatorViewState | null>(null);
  const currentState =
    selectedState?.restaurantId === restaurantIdTrimmed
      ? selectedState
      : storedState;
  const ready = hydrated;
  const {
    activeOperator,
    showPicker,
    pickerOptions,
    lastOperator,
  } = currentState;

  useEffect(() => {
    const stored = readActiveOperatorSession();
    if (
      stored &&
      !isActiveOperatorValidForRestaurant(stored, restaurantIdTrimmed)
    ) {
      clearActiveOperatorSession();
    }
  }, [restaurantIdTrimmed]);

  const selectOperator = useCallback(
    (option: TpvOperatorPickerOption) => {
      if (!restaurantIdTrimmed) return;
      clearOperacionTpvUrlParams();
      const next: ActiveOperatorSession = {
        activeOperatorId: option.id,
        activeOperatorName: option.name,
        activeOperatorRole: option.role,
        selectedAt: Date.now(),
        restaurantId: restaurantIdTrimmed,
      };
      writeActiveOperatorSession(next);
      writeLastOperatorForRestaurant(restaurantIdTrimmed, option);
      setSelectedState({
        restaurantId: restaurantIdTrimmed,
        activeOperator: next,
        showPicker: false,
        pickerOptions,
        lastOperator: { id: option.id, name: option.name },
      });
    },
    [pickerOptions, restaurantIdTrimmed],
  );

  const requestOperatorChange = useCallback(() => {
    clearOperacionTpvUrlParams();
    clearActiveOperatorSession();
    setSelectedState({
      restaurantId: restaurantIdTrimmed,
      activeOperator: null,
      showPicker: true,
      pickerOptions: buildTpvOperatorPickerOptions(),
      lastOperator: readLastOperatorForRestaurant(restaurantIdTrimmed),
    });
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
