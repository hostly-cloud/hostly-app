"use client";

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { EditableFloorMap } from "@/components/map/EditableFloorMap";
import ModulePageShell from "@/components/module-page-shell";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  getDefaultSizeForPlanElementType,
  getTables,
  isDecorativePlanElementType,
  TABLE_MAP_STATUS_FREE,
  type FloorElement,
  type PlanElementType,
} from "@/lib/firestore/tables";
import {
  createDefaultFloorPlanIfNeeded,
  createFloorPlan,
  getFloorPlans,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import {
  getZones,
  updateZone,
  type Zone,
} from "@/lib/firestore/zones";

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: "#94a3b8",
  marginBottom: 4,
  letterSpacing: "0.02em",
};

const fieldBlock: CSSProperties = {
  marginBottom: 10,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.5)",
  color: "#f8fafc",
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
};

const readOnlyStyle: CSSProperties = {
  ...inputStyle,
  opacity: 0.88,
  cursor: "default",
};

const btnDanger: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  marginTop: 4,
};

const zoneLegendStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.45)",
  flexWrap: "wrap",
  maxWidth: "min(360px, 100%)",
};

const zoneLegendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#cbd5f5",
  whiteSpace: "nowrap",
};

const zoneHighlightSelectStyle: CSSProperties = {
  appearance: "none",
  padding: "6px 26px 6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background:
    "rgba(15, 23, 42, 0.65) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23cbd5f5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\") no-repeat right 10px center",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  minWidth: 160,
};

const smallBtn: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(15, 23, 42, 0.45)",
  color: "#e2e8f0",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallBtnDanger: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
};

const smallBtnActive: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.18)",
  color: "#e0f2fe",
  fontWeight: 700,
};

const primaryBtn: CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.18)",
  color: "#e0f2fe",
  fontWeight: 800,
};

const unsavedBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(249, 115, 22, 0.35)",
  background: "rgba(249, 115, 22, 0.14)",
  color: "#fed7aa",
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: "nowrap",
};

/** Barra principal del editor: acciones colocar + guardar. */
const editorTopBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  rowGap: 8,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
  marginBottom: 8,
  boxSizing: "border-box",
};

/** Herramientas de zona, vista y selección (menos protagonistas). */
const editorSecondaryStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  rowGap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 42, 0.32)",
  marginBottom: 12,
  boxSizing: "border-box",
};

const topBarMesaBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(56, 189, 248, 0.38)",
  background: "rgba(56, 189, 248, 0.16)",
  color: "#e0f2fe",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "-0.02em",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const topBarMesaBtnActive: CSSProperties = {
  ...topBarMesaBtn,
  background: "rgba(56, 189, 248, 0.28)",
  boxShadow: "inset 0 0 0 1px rgba(56, 189, 248, 0.25)",
};

const decorativeSelectStyle: CSSProperties = {
  ...zoneHighlightSelectStyle,
  minWidth: 148,
  fontSize: 12,
  padding: "6px 24px 6px 10px",
};

const miniToolBtn: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(15, 23, 42, 0.4)",
  color: "#e2e8f0",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const miniToolBtnDanger: CSSProperties = {
  ...miniToolBtn,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.1)",
  color: "#fecaca",
};

const miniToolBtnActive: CSSProperties = {
  ...miniToolBtn,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.14)",
  color: "#e0f2fe",
  fontWeight: 700,
};

const sidePanelStyle: CSSProperties = {
  flex: "0 0 270px",
  width: 270,
  maxWidth: "100%",
  minWidth: 240,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  padding: "11px 11px 10px",
  borderRadius: "var(--hostly-radius-md)",
  alignSelf: "stretch",
  overflow: "hidden",
};

const sidePanelTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 10,
};

const sideEmptyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 8,
  padding: "10px 2px",
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
};

function planTypeLabelEs(t: PlanElementType): string {
  switch (t) {
    case "sunbed":
      return "Hamaca";
    case "bed":
      return "Cama";
    case "wall":
      return "Pared";
    case "bar":
      return "Barra";
    case "column":
      return "Columna";
    case "pool":
      return "Piscina";
    case "custom":
      return "Personalizado";
    default:
      return "Mesa";
  }
}

function minSizeForPlanType(t: PlanElementType): { w: number; h: number } {
  if (t === "sunbed") return { w: 80, h: 40 };
  if (t === "bed") return { w: 100, h: 60 };
  if (t === "wall") return { w: 100, h: 6 };
  if (t === "bar") return { w: 80, h: 40 };
  if (t === "column") return { w: 24, h: 24 };
  if (t === "pool") return { w: 100, h: 60 };
  return { w: 60, h: 60 };
}

const DUPLICATE_OFFSET = 20;
/** Offset al pegar selección copiada (Ctrl/Cmd+V). */
const OFFSET = 20;
const GRID_SIZE = 10;

function snapToGrid(n: number): number {
  return Math.round(n / GRID_SIZE) * GRID_SIZE;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getNextElementName(
  type: PlanElementType,
  elements: Pick<FloorElement, "type" | "name">[],
): string {
  const baseName =
    type === "sunbed"
      ? "Hamaca"
      : type === "bed"
        ? "Cama"
        : type === "wall"
          ? "Pared"
          : type === "bar"
            ? "Barra"
            : type === "column"
              ? "Columna"
              : type === "pool"
                ? "Piscina"
                : "Mesa";
  const re = new RegExp(`^${baseName}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const el of elements) {
    if (el.type !== type) continue;
    const n = typeof el.name === "string" ? el.name.trim() : "";
    const m = re.exec(n);
    if (!m) continue;
    const parsed = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${baseName} ${Math.max(1, max + 1)}`;
}

const MAX_ELEMENT_HISTORY = 50;

function cloneElementList(els: FloorElement[]): FloorElement[] {
  return els.map((e) => ({ ...e }));
}

export type ConfigMesasPageProps = {
  lockViewportFillParent?: boolean;
};

export default function ConfigMesasPage({
  lockViewportFillParent = false,
}: ConfigMesasPageProps = {}) {
  const router = useRouter();
  const { user, restaurantId: profileRestaurantId, ready: authReady } =
    useAuth();
  const restaurantId = profileRestaurantId ?? user?.uid ?? null;

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [activeCreateType, setActiveCreateType] = useState<
    | "table"
    | "sunbed"
    | "bed"
    | "wall"
    | "bar"
    | "column"
    | "pool"
  >("table");

  const [loadedElements, setLoadedElements] = useState<FloorElement[]>([]);
  const [loadedZones, setLoadedZones] = useState<Zone[]>([]);
  const [elements, setElementsBase] = useState<FloorElement[]>([]);
  const [history, setHistory] = useState<FloorElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<FloorElement[][]>([]);
  const historyIndexRef = useRef(0);
  const [zones, setZones] = useState<Zone[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selectedFloorPlanId, setSelectedFloorPlanId] = useState<string | null>(
    null,
  );
  const [zoneHighlight, setZoneHighlight] = useState<
    "all" | "unassigned" | string
  >("all");
  const [editingZones, setEditingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardElements, setClipboardElements] = useState<
    FloorElement[] | null
  >(null);

  const [editorLayoutNarrow, setEditorLayoutNarrow] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [dimDraft, setDimDraft] = useState({
    w: "",
    h: "",
    x: "",
    y: "",
  });

  const [zoneDraft, setZoneDraft] = useState({
    name: "",
    color: "",
    x: "",
    y: "",
    width: "",
    height: "",
  });

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const replaceElementsHistory = useCallback((els: FloorElement[]) => {
    const snap = cloneElementList(els);
    const nh = [snap];
    setHistory(nh);
    historyRef.current = nh;
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  }, []);

  const pushHistory = useCallback((nextElements: FloorElement[]) => {
    const snap = cloneElementList(nextElements);
    const prevHist = historyRef.current;
    const idx = historyIndexRef.current;
    const cut = prevHist.slice(0, idx + 1);
    let nh = [...cut, snap];
    if (nh.length > MAX_ELEMENT_HISTORY) nh = nh.slice(-MAX_ELEMENT_HISTORY);
    const newIdx = nh.length - 1;
    historyIndexRef.current = newIdx;
    historyRef.current = nh;
    setHistory(nh);
    setHistoryIndex(newIdx);
  }, []);

  const commitElements = useCallback(
    (
      nextOrUpdater:
        | FloorElement[]
        | ((prev: FloorElement[]) => FloorElement[]),
    ) => {
      setElementsBase((prev) => {
        const next =
          typeof nextOrUpdater === "function"
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        pushHistory(next);
        return next;
      });
    },
    [pushHistory],
  );

  const setElementsNoHistory = useCallback(
    (
      nextOrUpdater:
        | FloorElement[]
        | ((prev: FloorElement[]) => FloorElement[]),
    ) => {
      setElementsBase(nextOrUpdater);
    },
    [],
  );

  const undo = useCallback(() => {
    setHistoryIndex((idx) => {
      if (idx <= 0) return idx;
      const newIdx = idx - 1;
      const h = historyRef.current;
      const snap = h[newIdx];
      if (!snap) return idx;
      const els = cloneElementList(snap);
      setElementsBase(els);
      historyIndexRef.current = newIdx;
      setSelectedIds((ids) =>
        ids.filter((id) =>
          els.some((e) => String(e.id).trim() === String(id).trim()),
        ),
      );
      return newIdx;
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryIndex((idx) => {
      const h = historyRef.current;
      if (idx >= h.length - 1) return idx;
      const newIdx = idx + 1;
      const snap = h[newIdx];
      if (!snap) return idx;
      const els = cloneElementList(snap);
      setElementsBase(els);
      historyIndexRef.current = newIdx;
      setSelectedIds((ids) =>
        ids.filter((id) =>
          els.some((e) => String(e.id).trim() === String(id).trim()),
        ),
      );
      return newIdx;
    });
  }, []);

  const resetFromLoaded = useCallback(() => {
    const snap = cloneElementList(loadedElements);
    setElementsBase(snap);
    replaceElementsHistory(loadedElements);
    setZones(loadedZones);
    setSelectedIds([]);
    setSelectedZoneId(null);
    setEditingZones(false);
    setHasUnsavedChanges(false);
  }, [loadedElements, loadedZones, replaceElementsHistory]);

  const refreshElements = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) {
      setLoadedElements([]);
      setElementsBase([]);
      replaceElementsHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getTables(restaurantId);
      const filtered = list.filter((t) => t.isActive !== false);
      setLoadedElements(filtered);
      const snap = cloneElementList(filtered);
      setElementsBase(snap);
      replaceElementsHistory(filtered);
      setHasUnsavedChanges(false);
    } catch {
      setLoadedElements([]);
      setElementsBase([]);
      replaceElementsHistory([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, replaceElementsHistory]);

  useEffect(() => {
    if (!authReady) return;
    void refreshElements();
  }, [authReady, refreshElements]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setLoadedZones([]);
      setZones([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await getZones(restaurantId);
        if (cancelled) return;
        setLoadedZones(list);
        setZones(list);
        setHasUnsavedChanges(false);
      } catch {
        if (!cancelled) {
          setLoadedZones([]);
          setZones([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setFloorPlans([]);
      setSelectedFloorPlanId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await createDefaultFloorPlanIfNeeded(restaurantId);
        const list = await getFloorPlans(restaurantId);
        if (cancelled) return;
        setFloorPlans(list);
        const def = list.find((p) => p.isDefault === true);
        const nextId = def?.id ?? list[0]?.id ?? null;
        setSelectedFloorPlanId(nextId);
      } catch {
        if (!cancelled) {
          setFloorPlans([]);
          setSelectedFloorPlanId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  const selectedFloorPlanName = useMemo(() => {
    if (!selectedFloorPlanId) return null;
    return (
      floorPlans.find((p) => p.id === selectedFloorPlanId)?.name?.trim() ?? null
    );
  }, [floorPlans, selectedFloorPlanId]);

  const visibleElements = useMemo(() => {
    return elements.filter((el) => {
      if (el.floorPlanId) {
        return el.floorPlanId === selectedFloorPlanId;
      }
      return true;
    });
  }, [elements, selectedFloorPlanId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      const ok = window.confirm("Tienes cambios sin guardar. ¿Salir igualmente?");
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [hasUnsavedChanges]);

  const selectedZone = useMemo(() => {
    if (!selectedZoneId) return null;
    return zones.find((z) => z.id === selectedZoneId) ?? null;
  }, [zones, selectedZoneId]);

  useEffect(() => {
    if (!selectedZone) {
      setZoneDraft({
        name: "",
        color: "",
        x: "",
        y: "",
        width: "",
        height: "",
      });
      return;
    }
    setZoneDraft({
      name: selectedZone.name ?? "",
      color: selectedZone.color ?? "",
      x:
        typeof selectedZone.x === "number" && Number.isFinite(selectedZone.x)
          ? String(selectedZone.x)
          : "",
      y:
        typeof selectedZone.y === "number" && Number.isFinite(selectedZone.y)
          ? String(selectedZone.y)
          : "",
      width:
        typeof selectedZone.width === "number" &&
        Number.isFinite(selectedZone.width)
          ? String(selectedZone.width)
          : "",
      height:
        typeof selectedZone.height === "number" &&
        Number.isFinite(selectedZone.height)
          ? String(selectedZone.height)
          : "",
    });
  }, [selectedZone]);

  const selectedElement = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const only = String(selectedIds[0]).trim();
    return elements.find((el) => String(el.id).trim() === only) ?? null;
  }, [elements, selectedIds]);

  const handleSelectElement = useCallback(
    (id: string, modifiers?: { shiftKey?: boolean }) => {
      const tid = String(id).trim();
      if (modifiers?.shiftKey) {
        setSelectedIds((prev) => {
          const trimmed = prev.map((p) => String(p).trim());
          const i = trimmed.indexOf(tid);
          if (i >= 0) {
            return prev.filter((_, idx) => idx !== i);
          }
          return [...prev, tid];
        });
      } else {
        setSelectedIds([tid]);
      }
    },
    [],
  );

  const handleRenameElement = useCallback((id: string, newName: string) => {
    const tid = String(id).trim();
    commitElements((prev) =>
      prev.map((el) =>
        String(el.id).trim() === tid ? { ...el, name: newName } : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [commitElements]);

  const selectedElementIndex = useMemo(() => {
    if (!selectedElement) return -1;
    return elements.findIndex(
      (el) => String(el.id).trim() === String(selectedElement.id).trim(),
    );
  }, [elements, selectedElement]);

  const showSideInspector = useMemo(
    () => editingZones || selectedIds.length > 0,
    [editingZones, selectedIds],
  );

  useEffect(() => {
    if (!selectedElement) {
      setNameDraft("");
      setDimDraft({ w: "", h: "", x: "", y: "" });
      return;
    }
    const def = getDefaultSizeForPlanElementType(selectedElement.type);
    setNameDraft(selectedElement.name ?? "");
    setDimDraft({
      w: String(selectedElement.width ?? def.width),
      h: String(selectedElement.height ?? def.height),
      x: String(selectedElement.x ?? 0),
      y: String(selectedElement.y ?? 0),
    });
  }, [selectedElement]);

  const zoneWithRectForPoint = useCallback(
    (x: number, y: number) => {
      let best: Zone | null = null;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const z of zones) {
        if (
          typeof z.x !== "number" ||
          typeof z.y !== "number" ||
          typeof z.width !== "number" ||
          typeof z.height !== "number" ||
          !Number.isFinite(z.x) ||
          !Number.isFinite(z.y) ||
          !Number.isFinite(z.width) ||
          !Number.isFinite(z.height)
        ) {
          continue;
        }
        const within =
          x >= z.x &&
          y >= z.y &&
          x <= z.x + z.width &&
          y <= z.y + z.height;
        if (!within) continue;
        const area = z.width * z.height;
        if (area < bestArea) {
          bestArea = area;
          best = z;
        }
      }
      return best;
    },
    [zones],
  );

  const persistElementZoneFromLayout = useCallback(
    async (id: string, x: number, y: number, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const z = zoneWithRectForPoint(cx, cy);
      setElementsNoHistory((prev) =>
        prev.map((el) =>
          el.id === id
            ? z
              ? { ...el, zoneId: z.id, zoneName: z.name, zone: z.name }
              : {
                  ...el,
                  zoneId: undefined,
                  zoneName: undefined,
                  zone: undefined,
                }
            : el,
        ),
      );
    },
    [restaurantId, zoneWithRectForPoint, editingZones, setElementsNoHistory],
  );

  type AlignMode = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";

  const alignSelectedElements = useCallback(
    (mode: AlignMode) => {
      if (editingZones) return;
      if (selectedIds.length < 2) return;
      const refSid = String(selectedIds[0]).trim();
      const restSids = selectedIds.slice(1).map((s) => String(s).trim());
      const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
      const floorW = floor?.clientWidth ?? 0;
      const floorH = floor?.clientHeight ?? 0;

      const persistLater: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];

      commitElements((prev) => {
        const ref = prev.find((el) => String(el.id).trim() === refSid);
        if (!ref) return prev;

        const refDef = getDefaultSizeForPlanElementType(ref.type);
        const rx = ref.x ?? 0;
        const ry = ref.y ?? 0;
        const rw = ref.width ?? refDef.width;
        const rh = ref.height ?? refDef.height;

        persistLater.length = 0;

        return prev.map((el) => {
          const id = String(el.id).trim();
          if (id === refSid) return el;
          if (!restSids.includes(id)) return el;
          if (el.locked === true) return el;

          const def = getDefaultSizeForPlanElementType(el.type);
          const w = el.width ?? def.width;
          const h = el.height ?? def.height;
          let nx = el.x ?? 0;
          let ny = el.y ?? 0;

          switch (mode) {
            case "left":
              nx = rx;
              break;
            case "centerH":
              nx = rx + rw / 2 - w / 2;
              break;
            case "right":
              nx = rx + rw - w;
              break;
            case "top":
              ny = ry;
              break;
            case "centerV":
              ny = ry + rh / 2 - h / 2;
              break;
            case "bottom":
              ny = ry + rh - h;
              break;
            default:
              break;
          }

          nx = snapToGrid(nx);
          ny = snapToGrid(ny);
          if (floorW > 0 && floorH > 0) {
            nx = clamp(nx, -w / 2, floorW - w / 2);
            ny = clamp(ny, -h / 2, floorH - h / 2);
          }

          persistLater.push({ id: el.id, x: nx, y: ny, w, h });
          return { ...el, x: nx, y: ny };
        });
      });

      for (const p of persistLater) {
        void persistElementZoneFromLayout(p.id, p.x, p.y, p.w, p.h);
      }

      setHasUnsavedChanges(true);
    },
    [selectedIds, editingZones, persistElementZoneFromLayout, commitElements],
  );

  const distributeSelectedElements = useCallback(
    (axis: "horizontal" | "vertical") => {
      if (editingZones) return;
      if (selectedIds.length < 3) return;
      const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
      const floorW = floor?.clientWidth ?? 0;
      const floorH = floor?.clientHeight ?? 0;

      const persistLater: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];

      commitElements((prev) => {
        persistLater.length = 0;
        const trimmed = selectedIds.map((s) => String(s).trim());
        const sel = trimmed
          .map((id) => prev.find((e) => String(e.id).trim() === id))
          .filter((e): e is FloorElement => Boolean(e));
        if (sel.length < 3) return prev;

        const sorted =
          axis === "horizontal"
            ? [...sel].sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
            : [...sel].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

        const n = sorted.length;
        const start =
          axis === "horizontal" ? sorted[0].x ?? 0 : sorted[0].y ?? 0;
        const end =
          axis === "horizontal"
            ? sorted[n - 1].x ?? 0
            : sorted[n - 1].y ?? 0;
        const spacing = (end - start) / (n - 1);

        const updates = new Map<string, { nx?: number; ny?: number }>();
        sorted.forEach((el, i) => {
          if (el.locked === true) return;
          const key = String(el.id).trim();
          const v = start + i * spacing;
          if (axis === "horizontal") updates.set(key, { nx: v });
          else updates.set(key, { ny: v });
        });

        return prev.map((el) => {
          const id = String(el.id).trim();
          const u = updates.get(id);
          if (!u) return el;

          const def = getDefaultSizeForPlanElementType(el.type);
          const w = el.width ?? def.width;
          const h = el.height ?? def.height;
          let nx = el.x ?? 0;
          let ny = el.y ?? 0;

          if (u.nx !== undefined) {
            nx = snapToGrid(u.nx);
            if (floorW > 0) nx = clamp(nx, -w / 2, floorW - w / 2);
          }
          if (u.ny !== undefined) {
            ny = snapToGrid(u.ny);
            if (floorH > 0) ny = clamp(ny, -h / 2, floorH - h / 2);
          }

          persistLater.push({ id: el.id, x: nx, y: ny, w, h });
          return { ...el, x: nx, y: ny };
        });
      });

      for (const p of persistLater) {
        void persistElementZoneFromLayout(p.id, p.x, p.y, p.w, p.h);
      }

      setHasUnsavedChanges(true);
    },
    [selectedIds, editingZones, persistElementZoneFromLayout, commitElements],
  );

  const handleMove = useCallback(
    async (id: string, x: number, y: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
      const floorW = floor?.clientWidth ?? 0;
      const floorH = floor?.clientHeight ?? 0;
      const moved = elements.find((el) => el.id === id);
      if (moved && floorW > 0 && floorH > 0) {
        const def = getDefaultSizeForPlanElementType(moved.type);
        const w = moved.width ?? def.width;
        const h = moved.height ?? def.height;
        x = clamp(x, -w / 2, floorW - w / 2);
        y = clamp(y, -h / 2, floorH - h / 2);
      }
      commitElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, x, y } : el)),
      );
      if (moved) {
        const def = getDefaultSizeForPlanElementType(moved.type);
        const w = moved.width ?? def.width;
        const h = moved.height ?? def.height;
        void persistElementZoneFromLayout(id, x, y, w, h);
      }
      setHasUnsavedChanges(true);
    },
    [restaurantId, editingZones, elements, persistElementZoneFromLayout, commitElements],
  );

  const handleResize = useCallback(
    async (id: string, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      const el = elements.find((e) => e.id === id);
      const mins = minSizeForPlanType(el?.type ?? "table");
      width = Math.max(mins.w, Math.round(width));
      height = Math.max(mins.h, Math.round(height));
      commitElements((prev) =>
        prev.map((it) => (it.id === id ? { ...it, width, height } : it)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId, editingZones, elements, commitElements],
  );

  const createFloorElement = useCallback(
    async (
      type: PlanElementType,
      x: number,
      y: number,
      opts?: {
        id?: string;
        name?: string;
        width?: number;
        height?: number;
        tableShape?: FloorElement["tableShape"];
        seats?: number;
        zoneId?: string;
        zoneName?: string;
        zone?: string;
      },
    ) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      if (type === "custom") return;
      const ref =
        typeof opts?.id === "string" && opts.id.trim()
          ? doc(db, "tables", opts.id.trim())
          : doc(collection(db, "tables"));
      const defSz = getDefaultSizeForPlanElementType(type);
      const w = opts?.width ?? defSz.width;
      const h = opts?.height ?? defSz.height;
      const cx = Math.round(x) + w / 2;
      const cy = Math.round(y) + h / 2;
      const zFromOpts =
        typeof opts?.zoneId === "string" &&
        opts.zoneId.trim() &&
        typeof opts?.zoneName === "string" &&
        opts.zoneName.trim()
          ? {
              zoneId: opts.zoneId.trim(),
              zoneName: opts.zoneName.trim(),
              zone:
                typeof opts.zone === "string" && opts.zone.trim()
                  ? opts.zone.trim()
                  : opts.zoneName.trim(),
            }
          : null;
      const zHit = zFromOpts ? null : zoneWithRectForPoint(cx, cy);
      commitElements((prev) => {
        const name = opts?.name?.trim() ? opts.name.trim() : getNextElementName(type, prev);
        const created: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type,
          status: TABLE_MAP_STATUS_FREE,
          ...(zFromOpts
            ? zFromOpts
            : zHit
              ? { zoneId: zHit.id, zoneName: zHit.name, zone: zHit.name }
              : {}),
          ...(selectedFloorPlanId
            ? { floorPlanId: selectedFloorPlanId }
            : {}),
          tableShape: opts?.tableShape ?? "square",
          seats:
            opts?.seats ??
            (isDecorativePlanElementType(type) ? 0 : 4),
          x: Math.round(x),
          y: Math.round(y),
          width: w,
          height: h,
          isActive: true,
        };
        return [...prev, created];
      });
      setSelectedIds([ref.id]);
      setHasUnsavedChanges(true);
    },
    [
      restaurantId,
      isFirebaseConfigured,
      editingZones,
      zoneWithRectForPoint,
      commitElements,
      selectedFloorPlanId,
    ],
  );

  const handleCreateZoneVisual = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (zones.length === 0) return;
    const preferred =
      zoneHighlight !== "all" && zoneHighlight !== "unassigned"
        ? zoneHighlight
        : zones[0]?.id;
    const zoneId = preferred ? String(preferred).trim() : "";
    const zone = zones.find((z) => z.id === zoneId) ?? zones[0]!;
    if (
      typeof zone.x === "number" &&
      typeof zone.y === "number" &&
      typeof zone.width === "number" &&
      typeof zone.height === "number" &&
      Number.isFinite(zone.x) &&
      Number.isFinite(zone.y) &&
      Number.isFinite(zone.width) &&
      Number.isFinite(zone.height)
    ) {
      setSelectedZoneId(zone.id);
      setEditingZones(true);
      return;
    }
    setZones((prev) =>
      prev.map((z) =>
        z.id === zone.id ? { ...z, x: 40, y: 40, width: 320, height: 220 } : z,
      ),
    );
    setSelectedZoneId(zone.id);
    setEditingZones(true);
    setHasUnsavedChanges(true);
  }, [restaurantId, zones, zoneHighlight]);

  const handleMoveZone = useCallback(
    async (zoneId: string, x: number, y: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      setZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, x, y } : z)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId],
  );

  const handleResizeZone = useCallback(
    async (zoneId: string, width: number, height: number) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      setZones((prev) =>
        prev.map((z) => (z.id === zoneId ? { ...z, width, height } : z)),
      );
      setHasUnsavedChanges(true);
    },
    [restaurantId],
  );

  const persistZoneFields = useCallback(async () => {
    if (!selectedZone || !restaurantId || !isFirebaseConfigured) return;
    const name = zoneDraft.name.trim();
    if (!name) return;
    const color = zoneDraft.color.trim() || null;
    const x = Number.parseFloat(zoneDraft.x);
    const y = Number.parseFloat(zoneDraft.y);
    const width = Number.parseFloat(zoneDraft.width);
    const height = Number.parseFloat(zoneDraft.height);
    const updates: Parameters<typeof updateZone>[1] = { name, color };
    if ([x, y, width, height].every((n) => Number.isFinite(n))) {
      updates.x = Math.round(x);
      updates.y = Math.round(y);
      updates.width = Math.round(width);
      updates.height = Math.round(height);
    }
    setZones((prev) =>
      prev.map((z) =>
        z.id === selectedZone.id
          ? {
              ...z,
              name,
              color: color ?? undefined,
              ...(updates.x != null ? { x: updates.x as number } : {}),
              ...(updates.y != null ? { y: updates.y as number } : {}),
              ...(updates.width != null ? { width: updates.width as number } : {}),
              ...(updates.height != null ? { height: updates.height as number } : {}),
            }
          : z,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedZone, restaurantId, zoneDraft]);

  const handleDeleteZoneVisual = useCallback(async () => {
    if (!selectedZone || !restaurantId || !isFirebaseConfigured) return;
    if (!window.confirm("¿Eliminar esta zona visual?")) return;
    setZones((prev) =>
      prev.map((z) =>
        z.id === selectedZone.id
          ? {
              ...z,
              x: undefined,
              y: undefined,
              width: undefined,
              height: undefined,
            }
          : z,
      ),
    );
    setSelectedZoneId(null);
    setHasUnsavedChanges(true);
  }, [selectedZone, restaurantId]);

  const persistName = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    const name = nameDraft.trim() || selectedElement.name;
    commitElements((prev) =>
      prev.map((el) => (el.id === selectedElement.id ? { ...el, name } : el)),
    );
    setHasUnsavedChanges(true);
  }, [selectedElement, nameDraft, restaurantId, commitElements]);

  const persistDims = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    const w = Math.round(Number.parseFloat(dimDraft.w));
    const h = Math.round(Number.parseFloat(dimDraft.h));
    const x = Math.round(Number.parseFloat(dimDraft.x));
    const y = Math.round(Number.parseFloat(dimDraft.y));
    const mins = minSizeForPlanType(selectedElement.type);
    if (
      ![w, h, x, y].every((n) => Number.isFinite(n)) ||
      w < mins.w ||
      h < mins.h
    ) {
      return;
    }
    commitElements((prev) =>
      prev.map((el) =>
        el.id === selectedElement.id ? { ...el, width: w, height: h, x, y } : el,
      ),
    );
    void persistElementZoneFromLayout(selectedElement.id, x, y, w, h);
    setHasUnsavedChanges(true);
  }, [
    selectedElement,
    dimDraft,
    restaurantId,
    persistElementZoneFromLayout,
    commitElements,
  ]);

  const persistZone = useCallback(
    async (zoneIdValue: string) => {
      if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
      const trimmed = zoneIdValue.trim();
      let nextZoneId: string | undefined;
      let nextZoneName: string | undefined;
      if (!trimmed) {
        nextZoneId = undefined;
        nextZoneName = undefined;
      } else {
        const z = zones.find((zz) => zz.id === trimmed);
        if (!z) return;
        nextZoneId = z.id;
        nextZoneName = z.name;
      }
      commitElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement.id
            ? {
                ...el,
                zoneId: nextZoneId,
                zoneName: nextZoneName,
                zone: nextZoneName,
              }
            : el,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [selectedElement, restaurantId, zones, commitElements],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    if (!window.confirm("¿Eliminar este elemento?")) return;
    commitElements((prev) => prev.filter((el) => el.id !== selectedElement.id));
    setSelectedIds((prevSel) =>
      prevSel.filter(
        (id) => String(id).trim() !== String(selectedElement.id).trim(),
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedElement, restaurantId, commitElements]);

  const handleBringToFront = useCallback(() => {
    if (!selectedElement) return;
    commitElements((prev) => {
      const idx = prev.findIndex(
        (el) => String(el.id).trim() === String(selectedElement.id).trim(),
      );
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.push(item);
      return next;
    });
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleSendToBack = useCallback(() => {
    if (!selectedElement) return;
    commitElements((prev) => {
      const idx = prev.findIndex(
        (el) => String(el.id).trim() === String(selectedElement.id).trim(),
      );
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleToggleElementLock = useCallback(() => {
    if (!selectedElement) return;
    const id = String(selectedElement.id).trim();
    commitElements((prev) =>
      prev.map((el) =>
        String(el.id).trim() === id
          ? { ...el, locked: !(el.locked === true) }
          : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedElement, commitElements]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedElement || !restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedElement.type === "custom") {
      return;
    }
    const ref = doc(collection(db, "tables"));
    const def = getDefaultSizeForPlanElementType(selectedElement.type);
    const width = selectedElement.width ?? def.width;
    const height = selectedElement.height ?? def.height;
    const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
    const floorW = floor?.clientWidth ?? 0;
    const floorH = floor?.clientHeight ?? 0;
    let x = snapToGrid((selectedElement.x ?? 0) + DUPLICATE_OFFSET);
    let y = snapToGrid((selectedElement.y ?? 0) + DUPLICATE_OFFSET);
    if (floorW > 0 && floorH > 0) {
      x = clamp(x, -width / 2, floorW - width / 2);
      y = clamp(y, -height / 2, floorH - height / 2);
    }

    const base = (selectedElement.name || planTypeLabelEs(selectedElement.type)).trim();
    const used = new Set<string>(
      elements.map((e) => (e.name ?? "").trim().toLowerCase()).filter(Boolean),
    );
    let name = `${base} copia`;
    if (used.has(name.toLowerCase())) {
      let i = 2;
      while (i < 9999) {
        const c = `${base} copia ${i}`;
        if (!used.has(c.toLowerCase())) {
          name = c;
          break;
        }
        i++;
      }
    }

    void createFloorElement(selectedElement.type, x, y, {
      id: ref.id,
      name,
      width,
      height,
      tableShape: selectedElement.tableShape ?? "square",
      seats:
        isDecorativePlanElementType(selectedElement.type)
          ? 0
          : (selectedElement.seats ?? 4),
      ...(selectedElement.zoneId && selectedElement.zoneName
        ? {
            zoneId: selectedElement.zoneId,
            zoneName: selectedElement.zoneName,
            zone: selectedElement.zoneName,
          }
        : {}),
    });
  }, [selectedElement, restaurantId, elements, editingZones, createFloorElement]);

  const handleDuplicateSelection = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedIds.length < 1) return;

    const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
    const floorW = floor?.clientWidth ?? 0;
    const floorH = floor?.clientHeight ?? 0;

    let cloneCount = 0;

    commitElements((prev) => {
      const clones: FloorElement[] = [];
      let acc = prev;
      const newSelectionIds: string[] = [];

      for (const sid of selectedIds) {
        const sidTrim = String(sid).trim();
        const source = prev.find((e) => String(e.id).trim() === sidTrim);
        if (!source) continue;
        if (source.type === "custom") {
          continue;
        }

        const ref = doc(collection(db, "tables"));
        const def = getDefaultSizeForPlanElementType(source.type);
        const w = source.width ?? def.width;
        const h = source.height ?? def.height;
        let nx = snapToGrid((source.x ?? 0) + DUPLICATE_OFFSET);
        let ny = snapToGrid((source.y ?? 0) + DUPLICATE_OFFSET);
        if (floorW > 0 && floorH > 0) {
          nx = clamp(nx, -w / 2, floorW - w / 2);
          ny = clamp(ny, -h / 2, floorH - h / 2);
        }

        const name = getNextElementName(
          source.type,
          acc.map((e) => ({ type: e.type, name: e.name })),
        );

        const clone: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type: source.type,
          status: TABLE_MAP_STATUS_FREE,
          ...(source.zoneId && source.zoneName
            ? {
                zoneId: source.zoneId,
                zoneName: source.zoneName,
                zone: source.zoneName,
              }
            : {}),
          ...(selectedFloorPlanId
            ? { floorPlanId: selectedFloorPlanId }
            : {}),
          tableShape: source.tableShape ?? "square",
          seats:
            isDecorativePlanElementType(source.type)
              ? 0
              : (source.seats ?? 4),
          x: nx,
          y: ny,
          width: w,
          height: h,
          isActive: true,
          locked: false,
        };

        clones.push(clone);
        newSelectionIds.push(ref.id);
        acc = [...acc, clone];
      }

      cloneCount = clones.length;
      if (clones.length === 0) return prev;

      queueMicrotask(() => {
        setSelectedIds(newSelectionIds);
      });

      return [...prev, ...clones];
    });

    if (cloneCount > 0) setHasUnsavedChanges(true);
  }, [
    selectedIds,
    restaurantId,
    editingZones,
    commitElements,
    selectedFloorPlanId,
  ]);

  const copySelectionToClipboard = useCallback(() => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds.map((id) => String(id).trim()));
    const picked = elements.filter((el) => {
      const id = String(el.id).trim();
      if (!sel.has(id)) return false;
      return el.type !== "custom";
    });
    if (picked.length === 0) return;
    setClipboardElements(cloneElementList(picked));
  }, [selectedIds, elements]);

  const pasteFromClipboard = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (!clipboardElements || clipboardElements.length === 0) return;

    const floor = document.querySelector<HTMLElement>(".hostly-floor-editor-map");
    const floorW = floor?.clientWidth ?? 0;
    const floorH = floor?.clientHeight ?? 0;

    let cloneCount = 0;

    commitElements((prev) => {
      const clones: FloorElement[] = [];
      let acc = prev;
      const newSelectionIds: string[] = [];

      for (const source of clipboardElements) {
        if (source.type === "custom") {
          continue;
        }

        const ref = doc(collection(db, "tables"));
        const def = getDefaultSizeForPlanElementType(source.type);
        const w = source.width ?? def.width;
        const h = source.height ?? def.height;
        let nx = snapToGrid((source.x ?? 0) + OFFSET);
        let ny = snapToGrid((source.y ?? 0) + OFFSET);
        if (floorW > 0 && floorH > 0) {
          nx = clamp(nx, -w / 2, floorW - w / 2);
          ny = clamp(ny, -h / 2, floorH - h / 2);
        }

        const name = getNextElementName(
          source.type,
          acc.map((e) => ({ type: e.type, name: e.name })),
        );

        const clone: FloorElement = {
          id: ref.id,
          restaurantId,
          name,
          type: source.type,
          status: TABLE_MAP_STATUS_FREE,
          ...(source.zoneId && source.zoneName
            ? {
                zoneId: source.zoneId,
                zoneName: source.zoneName,
                zone: source.zoneName,
              }
            : {}),
          ...(selectedFloorPlanId
            ? { floorPlanId: selectedFloorPlanId }
            : {}),
          tableShape: source.tableShape ?? "square",
          seats:
            isDecorativePlanElementType(source.type)
              ? 0
              : (source.seats ?? 4),
          x: nx,
          y: ny,
          width: w,
          height: h,
          isActive: true,
          locked: false,
        };

        clones.push(clone);
        newSelectionIds.push(ref.id);
        acc = [...acc, clone];
      }

      cloneCount = clones.length;
      if (clones.length === 0) return prev;

      queueMicrotask(() => {
        setSelectedIds(newSelectionIds);
      });

      return [...prev, ...clones];
    });

    if (cloneCount > 0) setHasUnsavedChanges(true);
  }, [
    restaurantId,
    editingZones,
    clipboardElements,
    commitElements,
    selectedFloorPlanId,
  ]);

  const handleDeleteSelection = useCallback(() => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (editingZones) return;
    if (selectedIds.length < 1) return;
    if (!window.confirm("¿Eliminar los elementos seleccionados?")) return;

    const remove = new Set(selectedIds.map((id) => String(id).trim()));

    commitElements((prev) =>
      prev.filter((el) => !remove.has(String(el.id).trim())),
    );
    setSelectedIds([]);
    setHasUnsavedChanges(true);
  }, [selectedIds, restaurantId, editingZones, commitElements]);

  const handleMoveSelectionToActiveFloorPlan = useCallback(() => {
    if (!selectedFloorPlanId) return;
    if (selectedIds.length < 1) return;
    if (editingZones) return;
    if (!window.confirm("¿Mover los elementos seleccionados a este plano?"))
      return;
    const sel = new Set(selectedIds.map((id) => String(id).trim()));
    commitElements((prev) =>
      prev.map((el) =>
        sel.has(String(el.id).trim())
          ? { ...el, floorPlanId: selectedFloorPlanId }
          : el,
      ),
    );
    setHasUnsavedChanges(true);
  }, [selectedFloorPlanId, selectedIds, editingZones, commitElements]);

  const handleCreateNewFloorPlan = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    const raw = window.prompt("Nombre del plano");
    if (raw == null) return;
    const name = raw.trim();
    if (!name) return;
    try {
      const created = await createFloorPlan(restaurantId, name);
      const updated = await getFloorPlans(restaurantId);
      setFloorPlans(updated);
      setSelectedFloorPlanId(created.id);
    } catch {
      /* ignore */
    }
  }, [restaurantId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "c" || e.key === "C")) {
        if (editingZones) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        if (!restaurantId || !isFirebaseConfigured) return;
        if (editingZones) return;
        if (!clipboardElements || clipboardElements.length === 0) return;
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIds.length === 0) return;
      if (!restaurantId || !isFirebaseConfigured) return;
      if (editingZones) return;
      e.preventDefault();
      void handleDeleteSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    selectedIds,
    restaurantId,
    editingZones,
    handleDeleteSelection,
    copySelectionToClipboard,
    pasteFromClipboard,
    clipboardElements,
  ]);

  const handleSavePlanChanges = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    const batch = writeBatch(db);

    const loadedById: Record<string, FloorElement> = {};
    for (const el of loadedElements) loadedById[el.id] = el;

    const currentIds = new Set(elements.map((e) => e.id));
    for (const oldId of Object.keys(loadedById)) {
      if (!currentIds.has(oldId)) {
        batch.delete(doc(db, "tables", oldId));
      }
    }

    for (const el of elements) {
      const ref = doc(db, "tables", el.id);
      const def = getDefaultSizeForPlanElementType(el.type);
      const mins = minSizeForPlanType(el.type);
      const width = Math.max(mins.w, Math.round(el.width ?? def.width));
      const height = Math.max(mins.h, Math.round(el.height ?? def.height));
      const decorative = isDecorativePlanElementType(el.type);
      const payload: DocumentData = {
        id: el.id,
        restaurantId,
        name: String(el.name ?? "").trim(),
        type: el.type,
        status: el.status ?? TABLE_MAP_STATUS_FREE,
        tableShape: el.tableShape ?? "square",
        seats: decorative ? 0 : (el.seats ?? 4),
        x: Math.round(el.x ?? 0),
        y: Math.round(el.y ?? 0),
        width,
        height,
        isActive: el.isActive !== false,
        locked: el.locked === true,
        updatedAt: serverTimestamp(),
      };
      if (el.zoneId && el.zoneName) {
        payload.zoneId = el.zoneId;
        payload.zoneName = el.zoneName;
        payload.zone = el.zoneName;
      } else {
        payload.zoneId = deleteField();
        payload.zoneName = deleteField();
        payload.zone = deleteField();
      }
      if (
        typeof el.floorPlanId === "string" &&
        el.floorPlanId.trim() !== ""
      ) {
        payload.floorPlanId = el.floorPlanId.trim();
      }
      if (loadedById[el.id]) {
        batch.update(ref, payload);
      } else {
        payload.createdAt = serverTimestamp();
        batch.set(ref, payload, { merge: true });
      }
    }

    const loadedZonesById: Record<string, Zone> = {};
    for (const z of loadedZones) loadedZonesById[z.id] = z;

    for (const z of zones) {
      const before = loadedZonesById[z.id];
      const changed =
        !before ||
        before.name !== z.name ||
        (before.color ?? "") !== (z.color ?? "") ||
        (before.x ?? null) !== (z.x ?? null) ||
        (before.y ?? null) !== (z.y ?? null) ||
        (before.width ?? null) !== (z.width ?? null) ||
        (before.height ?? null) !== (z.height ?? null);
      if (!changed) continue;
      const zref = doc(db, "zones", z.id);
      const up: DocumentData = {
        name: z.name,
        updatedAt: serverTimestamp(),
      };
      if (z.color && z.color.trim()) up.color = z.color.trim();
      else up.color = deleteField();
      if (
        typeof z.x === "number" &&
        typeof z.y === "number" &&
        typeof z.width === "number" &&
        typeof z.height === "number" &&
        Number.isFinite(z.x) &&
        Number.isFinite(z.y) &&
        Number.isFinite(z.width) &&
        Number.isFinite(z.height)
      ) {
        up.x = Math.round(z.x);
        up.y = Math.round(z.y);
        up.width = Math.round(z.width);
        up.height = Math.round(z.height);
      } else {
        up.x = deleteField();
        up.y = deleteField();
        up.width = deleteField();
        up.height = deleteField();
      }
      batch.update(zref, up);
    }

    try {
      await batch.commit();
      setLoadedElements(elements);
      setLoadedZones(zones);
      setHasUnsavedChanges(false);
    } catch {
      // keep unsaved state
    }
  }, [restaurantId, elements, zones, loadedElements, loadedZones]);

  const handleDiscardPlanChanges = useCallback(() => {
    if (!hasUnsavedChanges) return;
    if (!window.confirm("¿Descartar cambios sin guardar?")) return;
    resetFromLoaded();
  }, [hasUnsavedChanges, resetFromLoaded]);

  const hasAnyLockedElement = useMemo(
    () => elements.some((el) => el.locked === true),
    [elements],
  );

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setEditorLayoutNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const handleUnlockAllElements = useCallback(() => {
    if (!window.confirm("¿Desbloquear todos los elementos?")) return;
    commitElements((prev) => prev.map((el) => ({ ...el, locked: false })));
    setHasUnsavedChanges(true);
  }, [commitElements]);

  const showMapEmptyHint =
    !loading &&
    Boolean(restaurantId && isFirebaseConfigured) &&
    visibleElements.length === 0;

  const editorToolbar = (
    <>
      <div style={editorTopBarStyle}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            flex: "1 1 220px",
            minWidth: 0,
          }}
        >
          <button
            type="button"
            style={
              activeCreateType === "table" ? topBarMesaBtnActive : topBarMesaBtn
            }
            onClick={() => setActiveCreateType("table")}
            disabled={editingZones}
          >
            Añadir mesa
          </button>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Añadir elemento
            </span>
            <select
              id="hostly-decorative-place-type"
              aria-label="Tipo de elemento decorativo a colocar"
              value={activeCreateType === "table" ? "" : activeCreateType}
              onChange={(e) => {
                const v = e.target.value;
                if (
                  v === "sunbed" ||
                  v === "bed" ||
                  v === "wall" ||
                  v === "bar" ||
                  v === "column" ||
                  v === "pool"
                ) {
                  setActiveCreateType(v);
                }
              }}
              disabled={editingZones}
              style={decorativeSelectStyle}
            >
              <option value="">Elige tipo…</option>
              <option value="sunbed">{planTypeLabelEs("sunbed")}</option>
              <option value="bed">{planTypeLabelEs("bed")}</option>
              <option value="wall">{planTypeLabelEs("wall")}</option>
              <option value="bar">{planTypeLabelEs("bar")}</option>
              <option value="column">{planTypeLabelEs("column")}</option>
              <option value="pool">{planTypeLabelEs("pool")}</option>
            </select>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            justifyContent: "flex-end",
            flex: "1 1 160px",
            marginLeft: "auto",
          }}
        >
          {hasUnsavedChanges ? (
            <span style={unsavedBadgeStyle}>Sin guardar</span>
          ) : null}
          <button
            type="button"
            style={{
              ...primaryBtn,
              fontSize: 12,
              padding: "6px 12px",
              opacity: hasUnsavedChanges ? 1 : 0.5,
              cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
            }}
            onClick={() => void handleSavePlanChanges()}
            disabled={!hasUnsavedChanges}
          >
            Guardar
          </button>
          <button
            type="button"
            style={{
              ...smallBtn,
              fontSize: 12,
              padding: "6px 12px",
              opacity: hasUnsavedChanges ? 1 : 0.5,
              cursor: hasUnsavedChanges ? "pointer" : "not-allowed",
            }}
            onClick={handleDiscardPlanChanges}
            disabled={!hasUnsavedChanges}
          >
            Restablecer
          </button>
        </div>
      </div>

      <div style={editorSecondaryStripStyle}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 750,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginRight: 4,
          }}
        >
          Zonas y selección
        </span>
        <button
          type="button"
          style={editingZones ? miniToolBtnActive : miniToolBtn}
          onClick={() => {
            setEditingZones((v) => {
              const next = !v;
              if (next) setSelectedIds([]);
              else setSelectedZoneId(null);
              return next;
            });
          }}
        >
          {editingZones ? "Salir zonas" : "Editar zonas"}
        </button>
        <button
          type="button"
          style={miniToolBtn}
          onClick={() => void handleCreateZoneVisual()}
          disabled={zones.length === 0}
        >
          Zona visual
        </button>
        {zones.length > 0 ? (
          <select
            value={zoneHighlight}
            onChange={(e) => setZoneHighlight(e.target.value)}
            style={{ ...zoneHighlightSelectStyle, fontSize: 12, minWidth: 140 }}
            aria-label="Resaltar zona"
          >
            <option value="all">Todas las zonas</option>
            <option value="unassigned">Sin zona</option>
            <optgroup label="Zonas">
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </optgroup>
          </select>
        ) : null}
        {hasAnyLockedElement ? (
          <button
            type="button"
            style={miniToolBtn}
            onClick={() => void handleUnlockAllElements()}
            disabled={editingZones}
          >
            Desbloquear todo
          </button>
        ) : null}
        {selectedIds.length >= 1 ? (
          <>
            <button
              type="button"
              style={miniToolBtn}
              onClick={() => void handleDuplicateSelection()}
              disabled={editingZones}
            >
              Duplicar
            </button>
            <button
              type="button"
              style={miniToolBtnDanger}
              onClick={() => void handleDeleteSelection()}
              disabled={editingZones}
            >
              Eliminar
            </button>
            {selectedFloorPlanId ? (
              <button
                type="button"
                style={miniToolBtn}
                onClick={() => void handleMoveSelectionToActiveFloorPlan()}
                disabled={editingZones}
              >
                A este plano
              </button>
            ) : null}
          </>
        ) : null}
        {selectedIds.length >= 2 ? (
          <>
            <div
              style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 4,
              }}
              role="group"
              aria-label="Alinear elementos"
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Alinear
              </span>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Alinear a la izquierda"
                onClick={() => alignSelectedElements("left")}
              >
                ←
              </button>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Centrar horizontalmente"
                onClick={() => alignSelectedElements("centerH")}
              >
                H
              </button>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Alinear a la derecha"
                onClick={() => alignSelectedElements("right")}
              >
                →
              </button>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Alinear arriba"
                onClick={() => alignSelectedElements("top")}
              >
                ↑
              </button>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Centrar verticalmente"
                onClick={() => alignSelectedElements("centerV")}
              >
                V
              </button>
              <button
                type="button"
                style={miniToolBtn}
                disabled={editingZones}
                title="Alinear abajo"
                onClick={() => alignSelectedElements("bottom")}
              >
                ↓
              </button>
            </div>
            {selectedIds.length >= 3 ? (
              <div
                style={{
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                }}
                role="group"
                aria-label="Distribuir elementos"
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Repartir
                </span>
                <button
                  type="button"
                  style={miniToolBtn}
                  disabled={editingZones}
                  onClick={() => distributeSelectedElements("horizontal")}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  style={miniToolBtn}
                  disabled={editingZones}
                  onClick={() => distributeSelectedElements("vertical")}
                >
                  Vertical
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        {zones.length > 0 ? (
          <div
            style={{ ...zoneLegendStyle, marginLeft: "auto", maxWidth: 360 }}
            aria-label="Leyenda de zonas"
          >
            {zones.map((z) => (
              <span key={z.id} style={zoneLegendItemStyle}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: z.color ?? "rgba(148, 163, 184, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.45)",
                    flex: "none",
                  }}
                />
                <span>{z.name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <ModulePageShell
      title="Editor de plano"
      maxWidth={1400}
      compactLayout
      operationalFocus
      lockViewport
      lockViewportFillParent={lockViewportFillParent}
      backLabel="Volver"
    >
      {restaurantId && isFirebaseConfigured ? (
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 12px",
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#e2e8f0",
              letterSpacing: "-0.02em",
            }}
          >
            {selectedFloorPlanName ?? "—"}
          </span>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              flex: "1 1 200px",
              minWidth: 0,
            }}
          >
            <label
              htmlFor="hostly-floor-plan-select"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}
            >
              Plano
            </label>
            <select
              id="hostly-floor-plan-select"
              aria-label="Seleccionar plano"
              value={selectedFloorPlanId ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSelectedFloorPlanId(v ? v : null);
              }}
              style={{
                ...inputStyle,
                width: "auto",
                minWidth: 160,
                maxWidth: "100%",
                cursor: "pointer",
                fontSize: 12,
                padding: "6px 10px",
              }}
            >
              {floorPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={{ ...smallBtn, fontSize: 12, padding: "5px 10px" }}
              onClick={() => void handleCreateNewFloorPlan()}
            >
              Nuevo plano
            </button>
          </div>
        </div>
      ) : null}
      {editorToolbar}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          display: "flex",
          flexDirection: editorLayoutNarrow ? "column" : "row",
          alignItems: "stretch",
          gap: editorLayoutNarrow ? 14 : 16,
        }}
      >
        <div
          className="hostly-card"
          style={{
            flex: "1 1 0%",
            minWidth: 0,
            minHeight: editorLayoutNarrow ? 320 : 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            padding: 0,
            borderRadius: "var(--hostly-radius-md)",
            order: editorLayoutNarrow ? 1 : undefined,
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 20,
                color: "#94a3b8",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Cargando…
            </div>
          ) : !restaurantId || !isFirebaseConfigured ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>
              Conecta Firebase para editar el plano.
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                padding: "14px 16px 16px",
                boxSizing: "border-box",
              }}
            >
              {showMapEmptyHint ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 1,
                    padding: 24,
                  }}
                >
                  <div style={{ textAlign: "center", maxWidth: 340 }}>
                    <p
                      style={{
                        margin: 0,
                        color: "#94a3b8",
                        fontSize: 15,
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      Aún no hay elementos en el plano
                    </p>
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#64748b",
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.45,
                      }}
                    >
                      Empieza añadiendo una mesa, hamaca o cama
                    </p>
                  </div>
                </div>
              ) : null}
              <EditableFloorMap
                editable
                editorPlanSurface
                className="hostly-floor-editor-map"
                createType={activeCreateType}
                elements={visibleElements}
                selectedId={null}
                selectedIds={selectedIds}
                onSelect={editingZones ? undefined : handleSelectElement}
                onMove={handleMove}
                onResize={handleResize}
                onRename={editingZones ? undefined : handleRenameElement}
                onCreate={(type, x, y) => {
                  if (type === "custom") return;
                  void createFloorElement(type, x, y);
                }}
                zones={zones}
                zoneHighlight={zoneHighlight}
                editingZones={editingZones}
                selectedZoneId={selectedZoneId}
                onSelectZone={(id) => {
                  setSelectedZoneId(id);
                }}
                onMoveZone={handleMoveZone}
                onResizeZone={handleResizeZone}
              />
            </div>
          )}
        </div>

        {showSideInspector ? (
        <aside
          className="hostly-card"
          style={{
            ...sidePanelStyle,
            ...(editorLayoutNarrow
              ? {
                  flex: "0 0 auto",
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  maxHeight: "min(44vh, 420px)",
                  order: 2,
                }
              : {}),
          }}
        >
          <div style={sidePanelTitleStyle}>
            {editingZones ? "Zona" : "Detalle"}
          </div>

          {editingZones ? (
            selectedZone ? (
              <>
                <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
                <div style={fieldBlock}>
                  <label htmlFor="zona-nombre" style={fieldLabelStyle}>
                    Nombre
                  </label>
                  <input
                    id="zona-nombre"
                    style={inputStyle}
                    value={zoneDraft.name}
                    onChange={(e) =>
                      setZoneDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    onBlur={() => void persistZoneFields()}
                  />
                </div>

                <div style={fieldBlock}>
                  <label htmlFor="zona-color" style={fieldLabelStyle}>
                    Color
                  </label>
                  <input
                    id="zona-color"
                    style={inputStyle}
                    value={zoneDraft.color}
                    placeholder="#38bdf8"
                    onChange={(e) =>
                      setZoneDraft((d) => ({ ...d, color: e.target.value }))
                    }
                    onBlur={() => void persistZoneFields()}
                  />
                </div>

                <div
                  style={{
                    ...fieldBlock,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label htmlFor="zona-x" style={fieldLabelStyle}>
                      X
                    </label>
                    <input
                      id="zona-x"
                      type="number"
                      style={inputStyle}
                      value={zoneDraft.x}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, x: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                  <div>
                    <label htmlFor="zona-y" style={fieldLabelStyle}>
                      Y
                    </label>
                    <input
                      id="zona-y"
                      type="number"
                      style={inputStyle}
                      value={zoneDraft.y}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, y: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                </div>

                <div
                  style={{
                    ...fieldBlock,
                    marginBottom: 16,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label htmlFor="zona-w" style={fieldLabelStyle}>
                      Ancho
                    </label>
                    <input
                      id="zona-w"
                      type="number"
                      min={120}
                      style={inputStyle}
                      value={zoneDraft.width}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, width: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                  <div>
                    <label htmlFor="zona-h" style={fieldLabelStyle}>
                      Alto
                    </label>
                    <input
                      id="zona-h"
                      type="number"
                      min={90}
                      style={inputStyle}
                      value={zoneDraft.height}
                      onChange={(e) =>
                        setZoneDraft((d) => ({ ...d, height: e.target.value }))
                      }
                      onBlur={() => void persistZoneFields()}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  style={btnDanger}
                  onClick={() => void handleDeleteZoneVisual()}
                >
                  Eliminar zona visual
                </button>
                </div>
              </>
            ) : (
              <div style={sideEmptyStyle}>
                <div>Selecciona una zona</div>
                <div style={{ color: "#64748b", fontWeight: 500, fontSize: 13 }}>
                  o crea una nueva zona visual
                </div>
              </div>
            )
          ) : selectedIds.length >= 2 ? (
            <div
              style={{
                ...sideEmptyStyle,
                flex: 1,
                justifyContent: "flex-start",
                paddingTop: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>
                {selectedIds.length} elementos seleccionados
              </div>
              <div
                style={{
                  color: "#64748b",
                  fontWeight: 500,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 1.45,
                }}
              >
                Mayús+clic para añadir o quitar. El primero en la selección es la referencia al alinear.
              </div>
            </div>
          ) : selectedElement ? (
            <>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>

            <div style={fieldBlock}>
              <label htmlFor="el-nombre" style={fieldLabelStyle}>
                Nombre
              </label>
              <input
                id="el-nombre"
                style={inputStyle}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void persistName()}
              />
            </div>

            <div style={fieldBlock}>
              <label htmlFor="el-tipo" style={fieldLabelStyle}>
                Tipo
              </label>
              <input
                id="el-tipo"
                readOnly
                tabIndex={-1}
                style={readOnlyStyle}
                value={planTypeLabelEs(selectedElement.type)}
              />
            </div>

            <div style={fieldBlock}>
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  background: "rgba(15, 23, 42, 0.28)",
                  color: "#e2e8f0",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
                onClick={() => void handleToggleElementLock()}
              >
                {selectedElement.locked === true
                  ? "Desbloquear elemento"
                  : "Bloquear elemento"}
              </button>
            </div>

            <div style={fieldBlock}>
              <label htmlFor="el-zona" style={fieldLabelStyle}>
                Zona
              </label>
              <select
                id="el-zona"
                style={inputStyle}
                value={selectedElement.zoneId ?? ""}
                onChange={(e) => void persistZone(e.target.value)}
              >
                <option value="">Sin zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                ...fieldBlock,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label htmlFor="el-x" style={fieldLabelStyle}>
                  Posición X
                </label>
                <input
                  id="el-x"
                  type="number"
                  style={inputStyle}
                  value={dimDraft.x}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, x: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
              <div>
                <label htmlFor="el-y" style={fieldLabelStyle}>
                  Posición Y
                </label>
                <input
                  id="el-y"
                  type="number"
                  style={inputStyle}
                  value={dimDraft.y}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, y: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
            </div>

            <div
              style={{
                ...fieldBlock,
                marginBottom: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label htmlFor="el-w" style={fieldLabelStyle}>
                  Ancho
                </label>
                <input
                  id="el-w"
                  type="number"
                  min={48}
                  style={inputStyle}
                  value={dimDraft.w}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, w: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
              <div>
                <label htmlFor="el-h" style={fieldLabelStyle}>
                  Alto
                </label>
                <input
                  id="el-h"
                  type="number"
                  min={48}
                  style={inputStyle}
                  value={dimDraft.h}
                  onChange={(e) =>
                    setDimDraft((d) => ({ ...d, h: e.target.value }))
                  }
                  onBlur={() => void persistDims()}
                />
              </div>
            </div>
            </div>

            <div
              style={{
                position: "sticky",
                bottom: 0,
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(148, 163, 184, 0.18)",
                background: "rgba(15, 23, 42, 0.35)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    background: "rgba(15, 23, 42, 0.28)",
                    color: "#e2e8f0",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor:
                      selectedElementIndex < 0 ||
                      selectedElementIndex >= elements.length - 1
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      selectedElementIndex < 0 ||
                      selectedElementIndex >= elements.length - 1
                        ? 0.45
                        : 1,
                  }}
                  disabled={
                    selectedElementIndex < 0 ||
                    selectedElementIndex >= elements.length - 1
                  }
                  onClick={() => void handleBringToFront()}
                >
                  Traer delante
                </button>
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    background: "rgba(15, 23, 42, 0.28)",
                    color: "#e2e8f0",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor:
                      selectedElementIndex <= 0 ? "not-allowed" : "pointer",
                    opacity: selectedElementIndex <= 0 ? 0.45 : 1,
                  }}
                  disabled={selectedElementIndex <= 0}
                  onClick={() => void handleSendToBack()}
                >
                  Enviar detrás
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    background: "rgba(15, 23, 42, 0.28)",
                    color: "#e2e8f0",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  onClick={() => void handleDuplicate()}
                >
                  Duplicar
                </button>
                <button type="button" style={btnDanger} onClick={() => void handleDelete()}>
                  Eliminar
                </button>
              </div>
            </div>
            </>
          ) : (
            <div style={sideEmptyStyle}>
              <div>Selecciona un elemento</div>
              <div style={{ color: "#64748b", fontWeight: 500, fontSize: 13 }}>
                o añade uno nuevo al plano
              </div>
            </div>
          )}
        </aside>
        ) : null}
      </div>
    </ModulePageShell>
  );
}
