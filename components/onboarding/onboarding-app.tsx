"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth/auth-context";
import CartaImportPremiumLayout from "@/components/carta/carta-import-premium-layout";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import { loadCartaCategoriasLocal } from "@/lib/carta-categorias/local-store";
import { loadCartaFamiliasLocal } from "@/lib/carta-categorias/familias-local-store";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import {
  extractMenuFromUpload,
  MenuImportExtractError,
  MenuImportNoProductsError,
} from "@/lib/carta/extract-menu-from-upload";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { requestCreateStaffInvite } from "@/lib/staff-invites/request-create-staff-invite";
import { isValidStaffInviteEmail } from "@/lib/staff-invites/validate-email";
import {
  applyDefaultModifierFamilyIfEligible,
  fetchModifierFamiliesForRestaurante,
  findCartaCategoriaByNameLoose,
} from "@/lib/modificadores/default-modifier-family";
import {
  loadOnboardingCheckpoints,
  onboardingActivationPercent,
  type OnboardingCheckpointKey,
  type OnboardingCheckpoints,
  saveOnboardingCheckpoints,
} from "@/lib/hostly/onboarding-checkpoints";
import {
  clearOnboardingCartaFileBlob,
  fileMetaFromFile,
  loadOnboardingSession,
  persistOnboardingCartaFile,
  restoreOnboardingCartaFile,
  saveOnboardingSession,
  type OnboardingCartaPhase,
} from "@/lib/hostly/onboarding-session";
import { loadRestaurantProfile, saveRestaurantProfile, type RestaurantProfile, TIPOS_NEGOCIO, MODELOS_VENTA } from "@/lib/hostly/restaurant-profile";
import { saveEscandalloCosteForPlato } from "@/lib/hostly/save-escandallo-coste-onboarding";
import {
  createPlatoDraft,
  loadPlatos,
  savePlatos,
  TIPOS_PRODUCTO_VENTA,
  type TipoProductoVenta,
} from "@/lib/platos-local";
import { loadStock, saveStock, UNIDADES_STOCK, newStockProductoId, type StockProducto, type UnidadStock } from "@/lib/stock-local";
import {
  hasMenuInventorySources,
  suggestInventoryFromMenu,
  suggestOnboardingBaseInventory,
  type InventoryMenuSuggestion,
  type MenuInventorySourceItem,
} from "@/lib/inventory/suggest-inventory-from-menu";
import {
  defaultModulosForRol,
  loadUsuarios,
  newUsuarioId,
  saveUsuarios,
  USUARIO_ROLES,
  type UsuarioLocal,
  type UsuarioRol,
} from "@/lib/usuarios-local";

const STEP_CHECKPOINT: (OnboardingCheckpointKey | null)[] = ["negocio", "carta", "catalogo", "inventario", "usuarios", "escandallo", null];

const TIPO_KEYS: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

/** Inputs onboarding alineados con Hostly configLight / ice (compactos). */
const inp: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--hostly-table-divider-soft)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink)",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  minHeight: 38,
};

const lbl: CSSProperties = {
  display: "block",
  fontSize: 9.5,
  fontWeight: 600,
  color: "var(--hostly-ink-faint)",
  marginBottom: 4,
  letterSpacing: "0.085em",
  textTransform: "uppercase",
};

const onboardingLead: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--hostly-ink-muted)",
  fontWeight: 500,
};

const onboardingSectionTitle = "hostly-heading m-0 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-[color:var(--hostly-ink-strong)]";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ONBOARDING_FETCH_TIMEOUT_MS = 8_000;

async function withOnboardingFetchTimeout<T>(promise: Promise<T>, fallback: () => T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback()), ONBOARDING_FETCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function marginPct(coste: number, pvp: number): number | null {
  if (pvp <= 0 || !Number.isFinite(pvp)) return null;
  if (!Number.isFinite(coste)) return null;
  return ((pvp - coste) / pvp) * 100;
}

function marginTier(pct: number | null): "none" | "excelente" | "bueno" | "ajustado" | "peligro" {
  if (pct == null) return "none";
  if (pct > 75) return "excelente";
  if (pct >= 65) return "bueno";
  if (pct >= 55) return "ajustado";
  return "peligro";
}

type IngLine = { id: string; stockId: string; cantidad: string; costeLinea: string };

type MenuInventoryDraft = InventoryMenuSuggestion & { selected: boolean };

const ONBOARDING_CP_ORDER: readonly OnboardingCheckpointKey[] = [
  "negocio",
  "carta",
  "catalogo",
  "inventario",
  "usuarios",
  "escandallo",
];

function lastCompletedCheckpointLabel(cp: Pick<Record<OnboardingCheckpointKey, boolean>, OnboardingCheckpointKey>, t: (k: string) => string): string | null {
  const map: Record<OnboardingCheckpointKey, string> = {
    negocio: t("onboarding.chkNegocio"),
    carta: t("onboarding.chkCarta"),
    catalogo: t("onboarding.chkCatalogo"),
    inventario: t("onboarding.chkInventario"),
    usuarios: t("onboarding.chkUsuarios"),
    escandallo: t("onboarding.chkEscandallo"),
  };
  for (let i = ONBOARDING_CP_ORDER.length - 1; i >= 0; i--) {
    const k = ONBOARDING_CP_ORDER[i];
    if (cp[k]) return map[k];
  }
  return null;
}

function groupCatalogRowsBySuggestedCategory(rows: ExtractedMenuRow[]): { catKey: string; items: ExtractedMenuRow[] }[] {
  const m = new Map<string, ExtractedMenuRow[]>();
  for (const r of rows) {
    const c = (r.categoria ?? "").trim() || "—";
    const arr = m.get(c);
    if (arr) arr.push(r);
    else m.set(c, [r]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([catKey, items]) => ({ catKey, items }));
}

export default function OnboardingApp() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user, restaurantId: authRestaurantId, restaurantName: authRestaurantName } = useAuth();
  const initialSession = useMemo(() => loadOnboardingSession(), []);
  const [step, setStep] = useState(initialSession.step);
  const [checkpoints, setCheckpoints] = useState<OnboardingCheckpoints>(loadOnboardingCheckpoints);
  const [profile, setProfile] = useState<RestaurantProfile>(loadRestaurantProfile);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeLock = useRef(false);
  const sessionReady = useRef(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const flashSaved = useCallback((msg: string) => {
    setSavedHint(msg);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSavedHint(null), 2200);
  }, []);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [procBusy, setProcBusy] = useState(false);
  const [cartaIaPhase, setCartaIaPhase] = useState(0);
  const [cartaPhase, setCartaPhase] = useState<OnboardingCartaPhase>(initialSession.cartaPhase);
  const [analyzeError, setAnalyzeError] = useState<string | null>(initialSession.analyzeError);
  const [noProductsDetected, setNoProductsDetected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [catalogDraft, setCatalogDraft] = useState<ExtractedMenuRow[]>(initialSession.catalogDraft);
  const [catFilter, setCatFilter] = useState<"all" | TipoProductoVenta>("all");
  const [catalogCreating, setCatalogCreating] = useState(false);
  const [catalogCreateError, setCatalogCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restored = await restoreOnboardingCartaFile();
      if (cancelled) return;
      if (restored) {
        setFile(restored.file);
        setPreviewUrl((prev) => {
          if (prev && prev !== restored.previewUrl) URL.revokeObjectURL(prev);
          return restored.previewUrl;
        });
        if (initialSession.catalogDraft.length > 0) {
          setCartaPhase("analyzed");
        } else if (initialSession.cartaPhase === "file_ready" || initialSession.fileMeta) {
          setCartaPhase("file_ready");
        }
      } else if (initialSession.fileMeta && initialSession.catalogDraft.length === 0) {
        setCartaPhase("file_ready");
      }
      if (initialSession.catalogDraft.length > 0 && initialSession.step === 1) {
        setCartaPhase("analyzed");
      }
      sessionReady.current = true;
      setSessionHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSession.catalogDraft.length, initialSession.cartaPhase, initialSession.fileMeta, initialSession.step]);

  useEffect(() => {
    if (!sessionHydrated) return;
    saveOnboardingSession({
      v: 1,
      step,
      catalogDraft,
      cartaPhase,
      fileMeta: file ? fileMetaFromFile(file) : null,
      analyzeError,
    });
  }, [sessionHydrated, step, catalogDraft, cartaPhase, analyzeError, file]);

  useEffect(() => {
    if (!procBusy) {
      setCartaIaPhase(0);
      return;
    }
    const id = setInterval(() => setCartaIaPhase((p) => (p + 1) % 4), 880);
    return () => clearInterval(id);
  }, [procBusy]);

  const goReviewCatalog = useCallback(() => {
    if (catalogDraft.length === 0) return;
    setStep(2);
  }, [catalogDraft.length]);

  const [stockRows, setStockRows] = useState<StockProducto[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [stockSuggestionsVisible, setStockSuggestionsVisible] = useState(false);
  const [menuInventoryDrafts, setMenuInventoryDrafts] = useState<MenuInventoryDraft[] | null>(null);

  const [uNombre, setUNombre] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uRol, setURol] = useState<UsuarioRol>("operativo");
  const [userFormVisible, setUserFormVisible] = useState(false);
  const [usersList, setUsersList] = useState<UsuarioLocal[]>([]);
  const [userSaving, setUserSaving] = useState(false);
  const [usersStepBusy, setUsersStepBusy] = useState(false);
  const [usersInviteError, setUsersInviteError] = useState<string | null>(null);
  const [userFormError, setUserFormError] = useState<string | null>(null);

  const [escPlatoId, setEscPlatoId] = useState<string>("");
  const [escLines, setEscLines] = useState<IngLine[]>([]);
  const [escSaving, setEscSaving] = useState(false);
  const [escErr, setEscErr] = useState<string | null>(null);

  const rid = getBrowserRestauranteId();

  useEffect(() => {
    setUsersList(loadUsuarios());
    if (step === 3) {
      const hasMenuCatalog =
        catalogDraft.some((r) => r.selected && r.nombre.trim()) ||
        loadPlatos(rid).some((p) => p.nombre.trim());
      setStockRows(hasMenuCatalog ? [] : loadStock());
      setStockSuggestionsVisible(false);
      setMenuInventoryDrafts(null);
    } else {
      setStockRows(loadStock());
    }
    if (step === 4) {
      setUserFormVisible(false);
      setUNombre("");
      setUEmail("");
      setURol("operativo");
      setUsersInviteError(null);
      setUserFormError(null);
    }
  }, [step, catalogDraft, rid]);

  const markCheckpoint = useCallback((key: OnboardingCheckpointKey) => {
    setCheckpoints((prev) => {
      const next = { ...prev, [key]: true };
      saveOnboardingCheckpoints(next);
      return next;
    });
  }, []);

  const stepLabels = useMemo(
    () => [
      t("onboarding.stepNegocio"),
      t("onboarding.stepCarta"),
      t("onboarding.stepCatalogo"),
      t("onboarding.stepInventario"),
      t("onboarding.stepUsuarios"),
      t("onboarding.stepEscandallo"),
      t("onboarding.stepActivacion"),
    ],
    [t],
  );

  const platos = useMemo(() => loadPlatos(rid), [rid, step, checkpoints]);

  const menuItemsForInventory = useMemo((): MenuInventorySourceItem[] => {
    const fromDraft = catalogDraft
      .filter((r) => r.selected && r.nombre.trim())
      .map((r) => ({
        name: r.nombre.trim(),
        categoryName: (r.categoria ?? "").trim() || undefined,
        type: r.tipoVenta,
      }));
    if (fromDraft.length > 0) return fromDraft;
    return platos
      .filter((p) => p.nombre.trim())
      .map((p) => ({
        name: p.nombre.trim(),
        categoryName: (p.categoria ?? "").trim() || undefined,
        type: p.tipoVenta,
      }));
  }, [catalogDraft, platos]);

  const hasMenuCatalogForInventory = useMemo(
    () => hasMenuInventorySources(menuItemsForInventory),
    [menuItemsForInventory],
  );

  const restaurantNameForInvite = useMemo(() => {
    const fromAuth = authRestaurantName?.trim();
    if (fromAuth) return fromAuth;
    const fromProfile = profile.nombre.trim();
    if (fromProfile) return fromProfile;
    return "Mi restaurante";
  }, [authRestaurantName, profile.nombre]);

  const persistUsersList = useCallback((next: UsuarioLocal[]) => {
    saveUsuarios(next);
    setUsersList(next);
  }, []);

  const createInviteForUsuario = useCallback(
    async (usuario: UsuarioLocal): Promise<UsuarioLocal> => {
      if (!isValidStaffInviteEmail(usuario.email)) {
        return {
          ...usuario,
          inviteStatus: "error",
          inviteError: t("onboarding.usersInviteInvalidEmail"),
        };
      }
      if (!authRestaurantId) {
        return {
          ...usuario,
          inviteStatus: "error",
          inviteError: t("onboarding.usersInviteNoRestaurant"),
        };
      }
      if (!user) {
        return {
          ...usuario,
          inviteStatus: "error",
          inviteError: t("onboarding.usersInviteNeedLogin"),
        };
      }

      const result = await requestCreateStaffInvite({
        email: usuario.email,
        displayName: usuario.nombre,
        role: usuario.rol,
        restaurantName: restaurantNameForInvite,
      });

      if (!result.ok) {
        return {
          ...usuario,
          inviteStatus: "error",
          inviteError: result.details ?? result.error,
        };
      }

      return {
        ...usuario,
        inviteStatus: "pending",
        inviteUrl: result.invite.inviteUrl,
        inviteId: result.invite.inviteId,
        inviteError: undefined,
      };
    },
    [authRestaurantId, restaurantNameForInvite, t, user],
  );

  const copyInviteLink = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        flashSaved(t("onboarding.usersInviteCopied"));
      } catch {
        flashSaved(t("onboarding.usersInviteCopyFailed"));
      }
    },
    [flashSaved, t],
  );

  const costeSum = useMemo(() => {
    let s = 0;
    for (const ln of escLines) {
      const c = Number(String(ln.costeLinea).replace(",", "."));
      if (Number.isFinite(c) && c >= 0) s += c;
    }
    return Math.round(s * 100) / 100;
  }, [escLines]);

  const escPlato = useMemo(() => platos.find((p) => p.id === escPlatoId), [platos, escPlatoId]);
  const pvp = escPlato?.precioVenta ?? 0;
  const mPct = marginPct(costeSum, pvp);
  const mTier = marginTier(mPct);

  const filteredCatalog = useMemo(() => {
    if (catFilter === "all") return catalogDraft;
    return catalogDraft.filter((r) => r.tipoVenta === catFilter);
  }, [catalogDraft, catFilter]);

  const catalogAssistStats = useMemo(() => {
    if (catalogDraft.length === 0) return null;
    const cats = new Set(catalogDraft.map((r) => (r.categoria ?? "").trim() || "—"));
    return {
      n: catalogDraft.length,
      catCount: cats.size,
      selected: catalogDraft.filter((r) => r.selected).length,
      loosePrice: catalogDraft.filter((r) => !Number.isFinite(r.precio) || r.precio <= 0).length,
    };
  }, [catalogDraft]);

  const sideStoryLines = useMemo(
    () =>
      [
        t("onboarding.sideStory0"),
        t("onboarding.sideStory1"),
        t("onboarding.sideStory2"),
        t("onboarding.sideStory3"),
        t("onboarding.sideStory4"),
        t("onboarding.sideStory5"),
        t("onboarding.sideStory6"),
      ] as const,
    [t],
  );

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    const ok = f.type.startsWith("image/") || f.type === "application/pdf";
    if (!ok) return;
    setPreviewUrl((prev) => {
      if (prev && !prev.startsWith("data:")) URL.revokeObjectURL(prev);
      return f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    });
    setFile(f);
    setCatalogDraft([]);
    setAnalyzeError(null);
    setNoProductsDetected(false);
    setCartaPhase("file_ready");
    void persistOnboardingCartaFile(f);
  }, []);

  const clearCartaFile = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev && !prev.startsWith("data:")) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
    setCatalogDraft([]);
    setAnalyzeError(null);
    setNoProductsDetected(false);
    setCartaPhase("idle");
    clearOnboardingCartaFileBlob();
  }, []);

  const loadExampleMenu = useCallback(async () => {
    const { createExampleMenuImageFile } = await import("@/lib/carta/example-menu-image");
    const img = await createExampleMenuImageFile(locale === "en" ? "en" : "es");
    pickFile(img);
  }, [locale, pickFile]);

  const runAnalyze = useCallback(async () => {
    if (!file || procBusy || analyzeLock.current) return;
    analyzeLock.current = true;
    setProcBusy(true);
    setAnalyzeError(null);
    setNoProductsDetected(false);
    try {
      const { rows } = await extractMenuFromUpload(file);
      setCatalogDraft(rows);
      setCartaPhase("analyzed");
      markCheckpoint("carta");
      flashSaved(t("onboarding.flashAnalyzed"));
    } catch (e) {
      if (e instanceof MenuImportNoProductsError) {
        setNoProductsDetected(true);
        setAnalyzeError(t("cartaImport.noProductsDetectedTitle"));
        setCartaPhase("file_ready");
      } else {
        setAnalyzeError(
          e instanceof MenuImportExtractError ? e.message : t("cartaImport.errorExtract"),
        );
        setCartaPhase("file_ready");
      }
    } finally {
      setProcBusy(false);
      analyzeLock.current = false;
    }
  }, [file, procBusy, markCheckpoint, flashSaved, t]);

  const saveNegocio = () => {
    if (!profile.nombre.trim()) return;
    saveRestaurantProfile(profile);
    markCheckpoint("negocio");
    setStep(1);
    flashSaved(t("onboarding.flashSaved"));
  };

  const createCatalog = async () => {
    const sel = catalogDraft.filter((r) => r.selected && r.nombre.trim());
    if (sel.length === 0 || catalogCreating) return;
    setCatalogCreating(true);
    setCatalogCreateError(null);
    try {
      const [cartaCats, cartaFams, modifierFamilies] = await Promise.all([
        withOnboardingFetchTimeout(fetchCartaCategorias(rid), () => loadCartaCategoriasLocal(rid)),
        withOnboardingFetchTimeout(fetchCartaFamilias(rid), () => loadCartaFamiliasLocal(rid)),
        withOnboardingFetchTimeout(fetchModifierFamiliesForRestaurante(rid, { ensureBase: false }), () => []),
      ]);
      const famByMenuId = new Map(cartaFams.map((f) => [f.id, f] as const));
      let next = [...loadPlatos(rid)];
      for (const r of sel) {
        const cat = findCartaCategoriaByNameLoose(cartaCats, (r.categoria ?? "").trim() || "General");
        const menuName = cat?.cartaFamiliaId != null ? famByMenuId.get(cat.cartaFamiliaId)?.name : undefined;
        let plato = createPlatoDraft(rid, {
          nombre: r.nombre.trim(),
          categoria: cat?.name ?? ((r.categoria ?? "").trim() || "General"),
          categoriaCartaId: cat?.id,
          cartaFamiliaId: cat?.cartaFamiliaId?.trim() || undefined,
          precioVenta: Number.isFinite(r.precio) ? r.precio : 0,
          tipoVenta: r.tipoVenta,
          activo: true,
        });
        plato = applyDefaultModifierFamilyIfEligible(plato, {
          selectedCartaCategoria: cat,
          cartaMenuFamiliaName: menuName,
          modifierFamilies,
        });
        next.push(plato);
      }
      savePlatos(rid, next);
      markCheckpoint("catalogo");
      setStep(3);
      flashSaved(t("onboarding.flashCatalog"));
    } catch (error) {
      console.error("[onboarding] createCatalog failed", error);
      setCatalogCreateError(t("onboarding.catalogCreateError"));
    } finally {
      setCatalogCreating(false);
    }
  };

  const saveInventario = () => {
    const rows = stockRows.filter((r) => r.nombre.trim());
    saveStock(rows);
    markCheckpoint("inventario");
    setStep(4);
    flashSaved(t("onboarding.flashStock"));
  };

  const addSuggested = () => {
    setStockSuggestionsVisible(true);
    setMenuInventoryDrafts((prev) => {
      if (prev !== null) return prev;
      const existingProductNames = stockRows.map((r) => r.nombre);
      const suggestions = hasMenuCatalogForInventory
        ? suggestInventoryFromMenu(menuItemsForInventory, { existingProductNames })
        : suggestOnboardingBaseInventory(existingProductNames);
      return suggestions.map((s) => ({ ...s, selected: true }));
    });
  };

  const applySelectedMenuSuggestions = () => {
    if (!menuInventoryDrafts?.length) return;
    const selected = menuInventoryDrafts.filter((d) => d.selected && d.nombre.trim());
    if (selected.length === 0) return;

    const have = new Set(stockRows.map((x) => normalizeName(x.nombre)));
    const toAdd: StockProducto[] = [];
    const appliedKeys = new Set<string>();

    for (const d of selected) {
      const key = normalizeName(d.nombre);
      if (!key || have.has(key)) {
        appliedKeys.add(key);
        continue;
      }
      toAdd.push({
        id: newStockProductoId(),
        nombre: d.nombre.trim(),
        unidad: d.unidad,
        stock_actual: d.stock_actual,
        stock_minimo: d.stock_minimo,
      });
      have.add(key);
      appliedKeys.add(key);
    }

    if (toAdd.length > 0) setStockRows((prev) => [...prev, ...toAdd]);

    setMenuInventoryDrafts((prev) => {
      if (!prev) return null;
      const remaining = prev.filter((d) => !d.selected || !appliedKeys.has(normalizeName(d.nombre)));
      return remaining.length > 0 ? remaining : null;
    });

    if (toAdd.length > 0) flashSaved(t("onboarding.flashSuggestedApplied", { n: String(toAdd.length) }));
  };

  const addManualStock = () => {
    setStockSuggestionsVisible(false);
    setStockRows((prev) => {
      if (prev.some((r) => !r.nombre.trim())) return prev;
      return [...prev, { id: newStockProductoId(), nombre: "", unidad: "uds", stock_actual: 0, stock_minimo: 0 }];
    });
  };

  const openAddUserForm = () => {
    setUserFormVisible(true);
    setUserFormError(null);
    setUNombre("");
    setUEmail("");
    setURol("operativo");
  };

  const addUser = async () => {
    const nom = uNombre.trim();
    const em = uEmail.trim();
    setUserFormError(null);
    if (nom.length < 2) {
      setUserFormError(t("onboarding.usersFormNameRequired"));
      return;
    }
    if (!isValidStaffInviteEmail(em)) {
      setUserFormError(t("onboarding.usersInviteInvalidEmail"));
      return;
    }
    if (userSaving) return;

    const nu: UsuarioLocal = {
      id: newUsuarioId(),
      nombre: nom,
      email: em,
      rol: uRol,
      activo: true,
      modulos: defaultModulosForRol(uRol),
    };
    const next = [...loadUsuarios(), nu];
    persistUsersList(next);
    setUserSaving(true);
    try {
      const withInvite = await createInviteForUsuario(nu);
      const updated = next.map((item) => (item.id === nu.id ? withInvite : item));
      persistUsersList(updated);
      if (withInvite.inviteStatus === "error") {
        setUsersInviteError(withInvite.inviteError ?? t("onboarding.usersInviteGenericError"));
      } else {
        setUsersInviteError(null);
        flashSaved(t("onboarding.flashUserInviteCreated"));
      }
      setUserFormVisible(false);
      setUNombre("");
      setUEmail("");
      setURol("operativo");
    } finally {
      setUserSaving(false);
    }
  };

  const continueUsers = async () => {
    if (usersStepBusy) return;
    setUsersStepBusy(true);
    setUsersInviteError(null);
    try {
      if (usersList.length > 0) {
        const updated: UsuarioLocal[] = [];
        for (const usuario of usersList) {
          if (usuario.inviteStatus === "pending" && usuario.inviteUrl) {
            updated.push(usuario);
            continue;
          }
          updated.push(await createInviteForUsuario(usuario));
        }
        persistUsersList(updated);
        const firstError = updated.find((item) => item.inviteStatus === "error");
        if (firstError?.inviteError) {
          setUsersInviteError(firstError.inviteError);
        }
      }
      markCheckpoint("usuarios");
      setStep(5);
    } finally {
      setUsersStepBusy(false);
    }
  };

  const addEscLine = () => {
    const st = loadStock();
    const first = st[0]?.id ?? "";
    setEscLines((prev) => [...prev, { id: `ln-${Date.now()}`, stockId: first, cantidad: "1", costeLinea: "0" }]);
  };

  useEffect(() => {
    if (step !== 5) return;
    const st = loadStock();
    if (!escPlatoId && platos.length) setEscPlatoId(platos[0].id);
    if (escLines.length === 0 && st.length) {
      setEscLines([{ id: "1", stockId: st[0].id, cantidad: "1", costeLinea: "0" }]);
    }
  }, [step, platos, escPlatoId, escLines.length]);

  const saveEscandallo = async () => {
    if (!escPlatoId || costeSum < 0) return;
    setEscErr(null);
    setEscSaving(true);
    try {
      const res = await saveEscandalloCosteForPlato(escPlatoId, costeSum);
      if (!res.ok) {
        setEscErr(res.error ?? "Error");
        return;
      }
      markCheckpoint("escandallo");
      setStep(6);
      flashSaved(t("onboarding.flashEscandallo"));
    } finally {
      setEscSaving(false);
    }
  };

  const activationPct = onboardingActivationPercent(checkpoints);
  const journeyPct = Math.min(100, Math.round((step / 6) * 100));
  const sideStoryLine = sideStoryLines[Math.min(step, 6)];
  const lastMarkedLabel = lastCompletedCheckpointLabel(checkpoints, t);

  const sideChecklist: { key: OnboardingCheckpointKey; label: string }[] = [
    { key: "negocio", label: t("onboarding.chkNegocio") },
    { key: "carta", label: t("onboarding.chkCarta") },
    { key: "catalogo", label: t("onboarding.chkCatalogo") },
    { key: "inventario", label: t("onboarding.chkInventario") },
    { key: "usuarios", label: t("onboarding.chkUsuarios") },
    { key: "escandallo", label: t("onboarding.chkEscandallo") },
  ];

  const renderStepper = () => {
    const n = stepLabels.length;
    const progressPct = n <= 1 ? (step >= n - 1 ? 100 : 0) : Math.min(100, Math.round((step / Math.max(n - 1, 1)) * 100));
    return (
      <div
        style={{
          flexShrink: 0,
          marginBottom: 6,
          borderRadius: 12,
          border: "1px solid var(--hostly-table-divider-soft)",
          background: "var(--hostly-surface-card-solid)",
          padding: "4px 4px 3px",
          boxShadow: "var(--hostly-shadow-hairline)",
          transition: "border-color 0.22s ease, box-shadow 0.26s ease",
        }}
      >
        <div style={{ padding: "0 2px 6px", borderBottom: "1px solid var(--hostly-table-divider-faint)" }}>
          <div
            style={{
              height: 3,
              borderRadius: 999,
              background: "color-mix(in srgb, var(--hostly-table-divider-soft) 55%, transparent)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--hostly-accent) 52%, transparent), var(--hostly-accent))",
                transition: "width 0.22s ease",
              }}
            />
          </div>
        </div>
        <div
          role="navigation"
          aria-label="Onboarding"
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            overflowX: "auto",
            paddingTop: 2,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
        >
          {stepLabels.flatMap((label, i) => {
            const active = i === step;
            const cpKey = STEP_CHECKPOINT[i];
            const stepDone = cpKey != null && checkpoints[cpKey];
            const isPast = i < step;
            const clickable = i <= step;
            const stepEl = (
              <button
                key={label}
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => {
                  if (i <= step) setStep(i);
                }}
                style={{
                  flex: "1 1 0%",
                  minWidth: "min(128px, 22vw)",
                  border: "none",
                  margin: 0,
                  background: active
                    ? "var(--hostly-info-soft)"
                    : stepDone || isPast
                      ? "color-mix(in srgb, var(--hostly-accent-soft) 38%, transparent)"
                      : "transparent",
                  color: active
                    ? "var(--hostly-navy-deep)"
                    : stepDone || isPast
                      ? "var(--hostly-accent)"
                      : "var(--hostly-ink-soft)",
                  padding: "6px 9px",
                  borderRadius: 9,
                  fontSize: 10,
                  fontWeight: 660,
                  letterSpacing: "-0.01em",
                  cursor: clickable ? "pointer" : "default",
                  opacity: clickable ? 1 : 0.45,
                  lineHeight: 1.22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 6,
                  textAlign: "left",
                  boxShadow: active ? "inset 0 0 0 1px color-mix(in srgb, var(--hostly-accent) 14%, transparent)" : "none",
                  transition: "background 0.2s ease, box-shadow 0.22s ease, opacity 0.2s ease",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    width: 16,
                    height: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 800,
                    background: stepDone || isPast ? "color-mix(in srgb, var(--hostly-success-soft) 94%, transparent)" : "var(--hostly-table-head-surface)",
                    color: active ? "var(--hostly-navy-deep)" : stepDone ? "var(--hostly-accent)" : "var(--hostly-ink-muted)",
                  }}
                >
                  {stepDone && !active ? "✓" : i + 1}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    wordBreak: "break-word",
                  }}
                >
                  {label}
                </span>
              </button>
            );

            const sep =
              i > 0 ? (
                <div
                  key={`sep-${label}`}
                  style={{
                    width: 1,
                    alignSelf: "stretch",
                    margin: "5px 0",
                    flexShrink: 0,
                    background: "var(--hostly-table-divider-faint)",
                  }}
                  aria-hidden
                />
              ) : null;
            return sep ? [sep, stepEl] : [stepEl];
          })}
        </div>
      </div>
    );
  };

  const panelMain = () => {
    switch (step) {
      case 0:
        return (
          <div className="onboarding-scroll-step" style={{ gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.negocioTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.negocioSub")}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>{t("onboarding.fieldNombre")}</label>
                <input style={inp} value={profile.nombre} onChange={(e) => setProfile({ ...profile, nombre: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldTipo")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tipoNegocio} onChange={(e) => setProfile({ ...profile, tipoNegocio: e.target.value as RestaurantProfile["tipoNegocio"] })}>
                  {TIPOS_NEGOCIO.map((x) => (
                    <option key={x} value={x}>
                      {t(`onboarding.tipo.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldEmpleados")}</label>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  value={profile.empleadosAprox}
                  onChange={(e) => setProfile({ ...profile, empleadosAprox: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldCocina")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tieneCocina ? "1" : "0"} onChange={(e) => setProfile({ ...profile, tieneCocina: e.target.value === "1" })}>
                  <option value="1">{t("onboarding.yes")}</option>
                  <option value="0">{t("onboarding.no")}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldBarra")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.tieneBarra ? "1" : "0"} onChange={(e) => setProfile({ ...profile, tieneBarra: e.target.value === "1" })}>
                  <option value="1">{t("onboarding.yes")}</option>
                  <option value="0">{t("onboarding.no")}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{t("onboarding.fieldModelo")}</label>
                <select style={{ ...inp, cursor: "pointer" }} value={profile.modeloVenta} onChange={(e) => setProfile({ ...profile, modeloVenta: e.target.value as RestaurantProfile["modeloVenta"] })}>
                  {MODELOS_VENTA.map((x) => (
                    <option key={x} value={x}>
                      {t(`onboarding.modelo.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={saveNegocio}
              disabled={!profile.nombre.trim()}
              className="hostly-button-primary mt-0.5 self-start px-4 py-2 text-[13px] font-semibold"
            >
              {t("onboarding.ctaSaveContinue")}
            </button>
          </div>
        );
      case 1:
        return (
          <CartaImportPremiumLayout
            variant="onboarding"
            accept="image/*,application/pdf"
            showPdfHint
            file={file}
            previewUrl={previewUrl}
            dragOver={dragOver}
            busy={procBusy}
            iaPhaseIndex={cartaIaPhase}
            wizardActiveStep={procBusy ? 2 : cartaPhase === "analyzed" ? 3 : file ? 2 : 1}
            wizardCompletedThrough={cartaPhase === "analyzed" ? 2 : file ? 1 : 0}
            analyzeResultCount={cartaPhase === "analyzed" ? catalogDraft.length : 0}
            onGoReviewCatalog={goReviewCatalog}
            analyzeError={analyzeError}
            onRetryAnalyze={() => void runAnalyze()}
            noProductsDetected={noProductsDetected}
            onUploadAnother={() => {
              clearCartaFile();
              fileRef.current?.click();
            }}
            fileRef={fileRef}
            onFileInputChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files[0] ?? null);
            }}
            onOpenFileDialog={() => fileRef.current?.click()}
            onAnalyze={runAnalyze}
            onExample={loadExampleMenu}
            onClearFile={clearCartaFile}
            showHero
            headerActions={
              <>
                <button type="button" onClick={() => router.push("/dashboard/carta")} className="hostly-button-secondary min-h-[36px] whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold">
                  {t("onboarding.cartaManual")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markCheckpoint("carta");
                    setCatalogDraft([]);
                    setStep(2);
                    flashSaved(t("onboarding.flashSaved"));
                  }}
                  className="hostly-button-secondary border-[var(--hostly-table-divider-soft)] px-3 py-1.5 text-[12px] font-semibold !bg-transparent !text-[color:var(--hostly-ink-muted)] hover:!bg-[var(--hostly-table-row-hover)]"
                >
                  {t("onboarding.cartaSkip")}
                </button>
              </>
            }
          />
        );
      case 2: {
        if (catalogDraft.length === 0) {
          return (
            <div className="onboarding-scroll-step" style={{ gap: 10 }}>
              <h2 className={onboardingSectionTitle}>{t("onboarding.catalogTitle")}</h2>
              <p style={onboardingLead}>{t("onboarding.catalogAssistLead")}</p>
              <button type="button" onClick={() => setStep(1)} className="hostly-button-primary self-start px-4 py-2 text-[13px] font-semibold">
                {t("onboarding.cartaAnalyze")}
              </button>
            </div>
          );
        }
        const nPlatos = catalogDraft.filter((x) => x.tipoVenta === "plato").length;
        const nBeb = catalogDraft.filter((x) => x.tipoVenta === "bebida").length;
        const selectedCatalogCount = catalogDraft.filter((r) => r.selected && r.nombre.trim()).length;
        const groups = groupCatalogRowsBySuggestedCategory(filteredCatalog);
        const iaRowColumns = "38px minmax(140px,2.4fr) minmax(100px,1fr) minmax(108px,1fr) minmax(84px,0.75fr)" as const;

        return (
          <div className="onboarding-scroll-step" style={{ gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h2 className={onboardingSectionTitle}>{t("onboarding.catalogTitle")}</h2>
              <span className="text-[11px] font-semibold text-[color:var(--hostly-ink-muted)]">
                {t("onboarding.catalogCount", { n: String(catalogDraft.length) })}
              </span>
            </div>
            <p style={{ ...onboardingLead, marginBottom: -2 }}>{t("onboarding.catalogAssistLead")}</p>
            {catalogAssistStats ? (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                  background: "color-mix(in srgb, var(--hostly-info-soft) 70%, transparent)",
                  boxShadow: "var(--hostly-shadow-hairline)",
                }}
              >
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--hostly-accent) 78%, transparent)" }}>
                  {t("onboarding.catalogAssistEyebrow")}
                </div>
                <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--hostly-navy-deep)", fontWeight: 590 }}>{t("onboarding.catalogAssistSub")}</p>
                <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.42, fontWeight: 600, color: "var(--hostly-navy-deep)" }}>
                  {t("onboarding.catalogAssistMeta", {
                    n: String(catalogAssistStats.n),
                    cats: String(catalogAssistStats.catCount),
                    sel: String(catalogAssistStats.selected),
                  })}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.42, fontWeight: 605, color: "var(--hostly-ink-muted)" }}>
                  {catalogAssistStats.loosePrice > 0 ? t("onboarding.catalogAssistPrices", { n: String(catalogAssistStats.loosePrice) }) : t("onboarding.catalogAssistNoPricesOk")}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["all", "plato", "bebida"] as const).map((f) => {
                const nf = f === "all" ? catalogDraft.length : f === "plato" ? nPlatos : nBeb;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCatFilter(f)}
                    style={{
                      border:
                        catFilter === f ? "1px solid color-mix(in srgb, var(--hostly-accent) 28%, transparent)" : "1px solid var(--hostly-table-divider-soft)",
                      background: catFilter === f ? "var(--hostly-accent-soft)" : "transparent",
                      color: catFilter === f ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                      padding: "4px 9px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 650,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 7,
                      transition: "border-color 0.18s ease, background 0.18s ease",
                    }}
                  >
                    <span>{f === "all" ? t("onboarding.filterAll") : t(TIPO_KEYS[f])}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        opacity: nf ? 1 : 0.45,
                        color: catFilter === f ? "var(--hostly-navy-deep)" : "var(--hostly-ink-faint)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {nf}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="onboarding-scroll-table-wrap">
              <div className="onboarding-scroll-table-x">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: iaRowColumns,
                  gap: 8,
                  padding: "7px 11px",
                  borderBottom: "1px solid var(--hostly-table-divider-soft)",
                  minWidth: "min(100%, 560px)",
                  background: "var(--hostly-table-head-surface)",
                  fontSize: 9,
                  fontWeight: 650,
                  color: "var(--hostly-ink-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <span />
                <span>{t("carta.colNombre")}</span>
                <span>{t("carta.colTipo")}</span>
                <span>{t("carta.colCategoria")}</span>
                <span style={{ textAlign: "right", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                  {t("carta.colPrecio")}
                  <span
                    aria-hidden
                    style={{
                      fontSize: 7.5,
                      padding: "1px 4px",
                      borderRadius: 4,
                      fontWeight: 750,
                      letterSpacing: "0.05em",
                      color: "var(--hostly-navy-deep)",
                      background: "color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--hostly-accent) 16%, transparent)",
                    }}
                  >
                    IA
                  </span>
                </span>
              </div>
              {groups.map(({ catKey, items }) => (
                <div key={catKey}>
                  <div
                    style={{
                      padding: "5px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      background: "color-mix(in srgb, var(--hostly-table-head-surface) 94%, transparent)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 720, letterSpacing: "0.04em", color: "var(--hostly-navy-deep)" }}>
                      {t("onboarding.catalogAssistGroupLabel", { cat: catKey })}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 630, fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink-muted)" }}>{items.length}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 8,
                        fontWeight: 740,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "color-mix(in srgb, var(--hostly-accent) 65%, transparent)",
                      }}
                    >
                      {t("onboarding.catalogAssistGroupHint")}
                    </span>
                  </div>
                  {items.map((r) => (
                    <div
                      key={r.tempId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: iaRowColumns,
                        gap: 8,
                        padding: "7px 11px",
                        alignItems: "center",
                        minWidth: "min(100%, 560px)",
                        borderBottom: "1px solid var(--hostly-table-divider-faint)",
                        background: "var(--hostly-surface-card-solid)",
                        borderLeft: "2px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <input type="checkbox" checked={r.selected} onChange={() => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, selected: !x.selected } : x)))} style={{ width: 16, height: 16 }} />
                      <input style={{ ...inp, minHeight: 36, padding: "6px 8px", fontSize: 13 }} value={r.nombre} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, nombre: e.target.value } : x)))} />
                      <select style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 12, cursor: "pointer" }} value={r.tipoVenta} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, tipoVenta: e.target.value as TipoProductoVenta } : x)))}>
                        {TIPOS_PRODUCTO_VENTA.map((tv) => (
                          <option key={tv} value={tv}>
                            {t(TIPO_KEYS[tv])}
                          </option>
                        ))}
                      </select>
                      <input style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 12 }} value={r.categoria} onChange={(e) => setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, categoria: e.target.value } : x)))} />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{
                          ...inp,
                          minHeight: 36,
                          padding: "6px",
                          fontSize: 13,
                          textAlign: "right",
                          borderColor:
                            Number.isFinite(r.precio) && r.precio > 0 ? "var(--hostly-table-divider-soft)" : "color-mix(in srgb, var(--hostly-accent) 22%, var(--hostly-table-divider-soft))",
                          background:
                            Number.isFinite(r.precio) && r.precio > 0 ? "var(--hostly-surface-card-solid)" : "color-mix(in srgb, var(--hostly-accent-soft) 55%, transparent)",
                        }}
                        value={r.precio}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n) || n < 0) return;
                          setCatalogDraft((d) => d.map((x) => (x.tempId === r.tempId ? { ...x, precio: Math.round(n * 100) / 100 } : x)));
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
              </div>
            </div>
            <div className="onboarding-scroll-step-footer">
              {catalogCreateError ? (
                <p style={{ width: "100%", margin: 0, fontSize: 12, lineHeight: 1.45, color: "#b42318", fontWeight: 600 }}>
                  {catalogCreateError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void createCatalog()}
                disabled={selectedCatalogCount === 0 || catalogCreating}
                className={`hostly-button-primary px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${catalogCreating ? "cursor-wait" : ""}`}
              >
                {catalogCreating ? "…" : t("onboarding.ctaCreateCatalog")}
              </button>
              <button type="button" onClick={() => setStep(1)} disabled={catalogCreating} className="hostly-button-secondary px-3 py-2 text-[12px] font-semibold disabled:opacity-50">
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          </div>
        );
      }
      case 3: {
        const stockRowColumns = "minmax(140px,3fr) minmax(88px,1fr) minmax(96px,1fr) minmax(96px,1fr)" as const;
        const suggestRowColumns = "38px minmax(140px,2.2fr) minmax(88px,1fr) minmax(96px,1fr) minmax(96px,1fr) minmax(72px,0.8fr)" as const;
        const filteredStockRows = stockRows.filter(
          (r) => normalizeName(r.nombre).includes(normalizeName(stockSearch)) || !stockSearch.trim(),
        );
        const selectedSuggestCount = menuInventoryDrafts?.filter((d) => d.selected && d.nombre.trim()).length ?? 0;
        const suggestPanelTitle = hasMenuCatalogForInventory ? t("onboarding.stockSuggestTitle") : t("onboarding.stockSuggestBaseTitle");
        const suggestPanelHint = hasMenuCatalogForInventory ? t("onboarding.stockSuggestHint") : t("onboarding.stockSuggestBaseHint");

        return (
          <div className="onboarding-scroll-step" style={{ gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.stockTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.stockSub")}</p>
            <input style={inp} placeholder={t("onboarding.stockSearch")} value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={addSuggested} className="hostly-button-secondary text-[12px] font-semibold px-3 py-1.5 min-h-[36px] border-[color-mix(in_srgb,var(--hostly-accent)_22%,transparent)] !bg-[var(--hostly-info-soft)]">
                {t("onboarding.stockAddSuggested")}
              </button>
              <button type="button" onClick={addManualStock} className="hostly-button-secondary text-[12px] font-semibold px-3 py-1.5 min-h-[36px] !bg-transparent !text-[color:var(--hostly-ink-muted)]">
                {t("onboarding.stockAddManual")}
              </button>
            </div>
            {stockSuggestionsVisible ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "10px 11px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                  background: "color-mix(in srgb, var(--hostly-info-soft) 55%, transparent)",
                  boxShadow: "var(--hostly-shadow-hairline)",
                }}
              >
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--hostly-accent) 72%, transparent)" }}>
                    {suggestPanelTitle}
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--hostly-navy-deep)", fontWeight: 580 }}>
                    {suggestPanelHint}
                  </p>
                </div>
                {!menuInventoryDrafts || menuInventoryDrafts.length === 0 ? (
                  hasMenuCatalogForInventory ? (
                    <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--hostly-ink-muted)", fontWeight: 600 }}>
                      {t("onboarding.stockSuggestEmpty")}
                    </p>
                  ) : null
                ) : (
                  <>
                    <div className="onboarding-scroll-table-wrap">
                      <div className="onboarding-scroll-table-x">
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: suggestRowColumns,
                            gap: 8,
                            padding: "7px 11px",
                            borderBottom: "1px solid var(--hostly-table-divider-soft)",
                            minWidth: "min(100%, 560px)",
                            background: "var(--hostly-table-head-surface)",
                            fontSize: 9,
                            fontWeight: 650,
                            color: "var(--hostly-ink-faint)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          <span aria-hidden />
                          <span>{t("carta.colNombre")}</span>
                          <span>{t("onboarding.stockColUnit")}</span>
                          <span>{t("onboarding.stockColActual")}</span>
                          <span>{t("onboarding.stockColMin")}</span>
                          <span>{t("onboarding.stockColCategory")}</span>
                        </div>
                        {menuInventoryDrafts.map((d) => (
                          <div
                            key={d.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: suggestRowColumns,
                              gap: 8,
                              padding: "7px 11px",
                              alignItems: "center",
                              minWidth: "min(100%, 560px)",
                              borderBottom: "1px solid var(--hostly-table-divider-faint)",
                              background: d.selected ? "var(--hostly-surface-card-solid)" : "color-mix(in srgb, var(--hostly-table-head-surface) 88%, transparent)",
                              opacity: d.selected ? 1 : 0.72,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={d.selected}
                              onChange={() =>
                                setMenuInventoryDrafts((prev) =>
                                  prev ? prev.map((x) => (x.id === d.id ? { ...x, selected: !x.selected } : x)) : prev,
                                )
                              }
                              style={{ width: 16, height: 16 }}
                            />
                            <input
                              style={{ ...inp, minHeight: 36, padding: "6px 8px", fontSize: 13 }}
                              value={d.nombre}
                              onChange={(e) =>
                                setMenuInventoryDrafts((prev) =>
                                  prev ? prev.map((x) => (x.id === d.id ? { ...x, nombre: e.target.value } : x)) : prev,
                                )
                              }
                            />
                            <select
                              style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 12, cursor: "pointer" }}
                              value={d.unidad}
                              onChange={(e) =>
                                setMenuInventoryDrafts((prev) =>
                                  prev ? prev.map((x) => (x.id === d.id ? { ...x, unidad: e.target.value as UnidadStock } : x)) : prev,
                                )
                              }
                            >
                              {UNIDADES_STOCK.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 13 }}
                              value={d.stock_actual}
                              onChange={(e) =>
                                setMenuInventoryDrafts((prev) =>
                                  prev
                                    ? prev.map((x) => (x.id === d.id ? { ...x, stock_actual: Number(e.target.value) || 0 } : x))
                                    : prev,
                                )
                              }
                            />
                            <input
                              type="number"
                              style={{ ...inp, minHeight: 36, padding: "6px", fontSize: 13 }}
                              value={d.stock_minimo}
                              onChange={(e) =>
                                setMenuInventoryDrafts((prev) =>
                                  prev
                                    ? prev.map((x) => (x.id === d.id ? { ...x, stock_minimo: Number(e.target.value) || 0 } : x))
                                    : prev,
                                )
                              }
                            />
                            <span style={{ fontSize: 10, fontWeight: 620, color: "var(--hostly-ink-muted)", textTransform: "capitalize" }}>
                              {d.categoria ?? "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={applySelectedMenuSuggestions}
                      disabled={selectedSuggestCount === 0}
                      className="hostly-button-secondary self-start px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                    >
                      {t("onboarding.stockApplySelected", { n: String(selectedSuggestCount) })}
                    </button>
                  </>
                )}
              </div>
            ) : null}
            {filteredStockRows.length > 0 ? (
              <div className="onboarding-scroll-table-wrap">
                {filteredStockRows.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: stockRowColumns,
                      minWidth: "min(100%, 480px)",
                      gap: 10,
                      padding: "8px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      alignItems: "center",
                      background: "var(--hostly-surface-card-solid)",
                    }}
                  >
                    <input style={{ ...inp, minHeight: 36 }} value={r.nombre} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, nombre: e.target.value } : x)))} />
                    <select style={{ ...inp, minHeight: 36, cursor: "pointer" }} value={r.unidad} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unidad: e.target.value as UnidadStock } : x)))}>
                      {UNIDADES_STOCK.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input type="number" style={{ ...inp, minHeight: 36 }} value={r.stock_actual} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_actual: Number(e.target.value) || 0 } : x)))} />
                    <input type="number" style={{ ...inp, minHeight: 36 }} value={r.stock_minimo} onChange={(e) => setStockRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock_minimo: Number(e.target.value) || 0 } : x)))} />
                  </div>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={saveInventario} className="hostly-button-primary self-start px-4 py-2 text-[13px] font-semibold">
              {t("onboarding.ctaSaveStock")}
            </button>
          </div>
        );
      }
      case 4:
        return (
          <div className="onboarding-scroll-step" style={{ gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.usersTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.usersSub")}</p>
            <p className="hostly-muted mt-0 text-[11px] leading-snug">{t("onboarding.usersInvitePhaseHint")}</p>
            {usersInviteError ? (
              <p className="m-0 rounded-lg border border-[color-mix(in_srgb,#dc2626_28%,transparent)] bg-[color-mix(in_srgb,#fee2e2_72%,transparent)] px-3 py-2 text-[11.5px] font-semibold text-[#991b1b]" role="alert">
                {usersInviteError}
              </p>
            ) : null}
            {!authRestaurantId ? (
              <p className="m-0 rounded-lg border border-[color-mix(in_srgb,#dc2626_28%,transparent)] bg-[color-mix(in_srgb,#fee2e2_72%,transparent)] px-3 py-2 text-[11.5px] font-semibold text-[#991b1b]" role="alert">
                {t("onboarding.usersInviteNoRestaurant")}
              </p>
            ) : null}
            {usersList.length === 0 && !userFormVisible ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "14px 13px",
                  borderRadius: 10,
                  border: "1px solid var(--hostly-table-divider-soft)",
                  background: "var(--hostly-surface-card-solid)",
                  boxShadow: "var(--hostly-shadow-hairline)",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: "var(--hostly-ink-strong)" }}>
                    {t("onboarding.usersEmptyTitle")}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--hostly-ink-muted)", fontWeight: 580 }}>
                    {t("onboarding.usersEmptySub")}
                  </p>
                </div>
                <button type="button" onClick={openAddUserForm} className="hostly-button-primary min-h-[36px] px-4 py-1.5 text-[12px] font-semibold">
                  {t("onboarding.ctaAddUser")}
                </button>
              </div>
            ) : null}
            {userFormVisible ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "10px 11px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--hostly-accent-soft) 100%, transparent)",
                  background: "color-mix(in srgb, var(--hostly-info-soft) 55%, transparent)",
                  boxShadow: "var(--hostly-shadow-hairline)",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={lbl}>{t("onboarding.userNombre")}</label>
                    <input style={inp} value={uNombre} onChange={(e) => setUNombre(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>{t("onboarding.userEmail")}</label>
                    <input style={inp} type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>{t("onboarding.userRol")}</label>
                    <select style={{ ...inp, cursor: "pointer" }} value={uRol} onChange={(e) => setURol(e.target.value as UsuarioRol)}>
                      {USUARIO_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`onboarding.rol.${r}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void addUser()}
                    disabled={userSaving}
                    className="hostly-button-secondary min-h-[36px] px-3 py-1.5 text-[12px] font-semibold border-[color-mix(in_srgb,var(--hostly-accent)_25%,transparent)] !bg-[var(--hostly-accent-soft)] !text-[color:var(--hostly-navy-deep)] disabled:opacity-60"
                  >
                    {userSaving ? t("onboarding.usersSaving") : t("onboarding.ctaSaveUser")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserFormVisible(false);
                      setUNombre("");
                      setUEmail("");
                      setURol("operativo");
                    }}
                    className="hostly-button-secondary min-h-[36px] px-3 py-1.5 text-[12px] font-semibold !bg-transparent !text-[color:var(--hostly-ink-muted)]"
                  >
                    {t("onboarding.ctaCancelUser")}
                  </button>
                </div>
                {userFormError ? (
                  <p className="m-0 text-[11.5px] font-semibold text-[#991b1b]" role="alert">
                    {userFormError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {usersList.length > 0 && !userFormVisible ? (
                <button type="button" onClick={openAddUserForm} className="hostly-button-secondary min-h-[36px] px-3 py-1.5 text-[12px] font-semibold border-[color-mix(in_srgb,var(--hostly-accent)_25%,transparent)] !bg-[var(--hostly-accent-soft)] !text-[color:var(--hostly-navy-deep)]">
                  {t("onboarding.ctaAddUser")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void continueUsers()}
                disabled={usersStepBusy}
                className="hostly-button-primary min-h-[36px] px-4 py-1.5 text-[12px] font-semibold disabled:opacity-60"
              >
                {usersStepBusy ? t("onboarding.usersContinuing") : t("onboarding.ctaUsersContinue")}
              </button>
            </div>
            <p className="hostly-muted mt-0 text-[11px] leading-snug">{t("onboarding.usersRolesHint")}</p>
            {usersList.length > 0 ? (
              <div className="onboarding-scroll-table-wrap">
                {usersList.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(92px,1fr) minmax(92px,1.1fr) minmax(72px,88px) minmax(120px,1.2fr) auto",
                      minWidth: "min(100%, 560px)",
                      gap: 8,
                      padding: "7px 9px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      fontSize: 12,
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-strong)",
                      alignItems: "center",
                    }}
                  >
                    <span>{u.nombre}</span>
                    <span className="text-[color:var(--hostly-ink-muted)]">{u.email}</span>
                    <span className="font-semibold">{t(`onboarding.rol.${u.rol}`)}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.35 }}>
                      {u.inviteStatus === "pending" ? (
                        <span className="font-semibold text-[color:var(--hostly-navy-deep)]">{t("onboarding.usersInvitePending")}</span>
                      ) : u.inviteStatus === "error" ? (
                        <span className="font-semibold text-[#991b1b]">{u.inviteError ?? t("onboarding.usersInviteGenericError")}</span>
                      ) : (
                        <span className="text-[color:var(--hostly-ink-muted)]">{t("onboarding.usersInviteNotCreated")}</span>
                      )}
                    </span>
                    {u.inviteUrl ? (
                      <button
                        type="button"
                        onClick={() => void copyInviteLink(u.inviteUrl!)}
                        className="hostly-button-secondary px-2.5 py-1 text-[11px] font-semibold min-h-[30px] !bg-transparent"
                      >
                        {t("onboarding.usersInviteCopyLink")}
                      </button>
                    ) : (
                      <span aria-hidden />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      case 5:
        if (platos.length === 0) {
          return (
            <div className="onboarding-scroll-step" style={{ gap: 10 }}>
              <h2 className={onboardingSectionTitle}>{t("onboarding.escTitle")}</h2>
              <p style={onboardingLead}>{t("onboarding.escNoPlatos")}</p>
              <button type="button" onClick={() => setStep(2)} className="hostly-button-secondary self-start px-3 py-2 text-[12px] font-semibold">
                {t("onboarding.ctaReanalyze")}
              </button>
            </div>
          );
        }
        return (
          <div className="onboarding-scroll-step" style={{ gap: 10 }}>
            <h2 className={onboardingSectionTitle}>{t("onboarding.escTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.escSub")}</p>
            <div>
              <label style={lbl}>{t("onboarding.escSelectPlato")}</label>
              <select style={{ ...inp, cursor: "pointer" }} value={escPlatoId} onChange={(e) => setEscPlatoId(e.target.value)}>
                {platos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.precioVenta.toFixed(2)} €
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={addEscLine} className="hostly-button-secondary self-start px-2.5 py-1.5 text-[12px] font-semibold">
              + {t("onboarding.escAddLine")}
            </button>
            <div className="onboarding-scroll-table-wrap">
              {escLines.map((ln) => {
                const st = loadStock();
                return (
                  <div
                    key={ln.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px,2.75fr) minmax(76px,0.95fr) minmax(100px,1fr)",
                      minWidth: "min(100%, 420px)",
                      gap: 10,
                      padding: "8px 11px",
                      borderBottom: "1px solid var(--hostly-table-divider-faint)",
                      alignItems: "center",
                      background: "var(--hostly-surface-card-solid)",
                    }}
                  >
                    <select style={{ ...inp, minHeight: 36, cursor: "pointer" }} value={ln.stockId} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, stockId: e.target.value } : x)))}>
                      {st.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                    <input style={{ ...inp, minHeight: 36 }} value={ln.cantidad} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, cantidad: e.target.value } : x)))} />
                    <input style={{ ...inp, minHeight: 36 }} value={ln.costeLinea} onChange={(e) => setEscLines((prev) => prev.map((x) => (x.id === ln.id ? { ...x, costeLinea: e.target.value } : x)))} placeholder="€" />
                  </div>
                );
              })}
            </div>
            {escErr ? <div style={{ color: "#b42318", fontSize: 12 }}>{escErr}</div> : null}
            <button
              type="button"
              disabled={escSaving || !escPlatoId || platos.length === 0}
              onClick={saveEscandallo}
              className={`hostly-button-primary mt-1 self-start px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${escSaving ? "cursor-wait" : ""}`}
            >
              {escSaving ? "…" : t("onboarding.ctaSaveEsc")}
            </button>
          </div>
        );
      case 6:
        return (
          <div className="onboarding-scroll-step" style={{ gap: 12, alignItems: "stretch" }}>
            <h2 className="hostly-heading m-0 text-[18px] font-semibold text-[color:var(--hostly-accent)]">{t("onboarding.doneTitle")}</h2>
            <p style={onboardingLead}>{t("onboarding.doneSub")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 8 }}>
              {[
                { label: t("onboarding.statCatalog"), value: String(loadPlatos(rid).length) },
                { label: t("onboarding.statStock"), value: String(loadStock().length) },
                { label: t("onboarding.statUsers"), value: String(loadUsuarios().length) },
                { label: t("onboarding.statEsc"), value: checkpoints.escandallo ? "✓" : "—" },
              ].map((x) => (
                <div
                  key={x.label}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--hostly-table-divider-soft)",
                    background: "var(--hostly-surface-card-solid)",
                    boxShadow: "var(--hostly-shadow-hairline)",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 650, color: "var(--hostly-ink-faint)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{x.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 720, color: "var(--hostly-ink-strong)", marginTop: 4 }}>{x.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {sideChecklist.map((c) => (
                <div
                  key={c.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: checkpoints[c.key] ? "var(--hostly-accent)" : "var(--hostly-ink-muted)",
                  }}
                >
                  <span style={{ opacity: checkpoints[c.key] ? 1 : 0.45 }}>{checkpoints[c.key] ? "✓" : "○"}</span>
                  {c.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => router.push("/dashboard")} className="hostly-button-primary px-5 py-2.5 text-[14px] font-semibold">
                {t("onboarding.ctaEnterDashboard")}
              </button>
              <Link href="/dashboard/carta" className="hostly-button-secondary inline-flex items-center px-4 py-2 text-[13px] font-semibold no-underline">
                {t("onboarding.ctaReviewCarta")}
              </Link>
              <Link href="/dashboard/stock" className="hostly-button-secondary inline-flex items-center px-4 py-2 text-[13px] font-semibold no-underline">
                {t("onboarding.ctaGoStock")}
              </Link>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const sidePanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 650,
              color: "var(--hostly-ink-faint)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {t("onboarding.sideLiveOps")}
          </div>
          {procBusy && step === 1 ? (
            <span title="" className="hostly-onboarding-op-dot inline-block shrink-0 rounded-full" style={{ width: 6, height: 6, background: "var(--hostly-accent)" }} aria-hidden />
          ) : escSaving && step === 5 ? (
            <span className="hostly-onboarding-op-dot inline-block shrink-0 rounded-full" style={{ width: 6, height: 6, background: "var(--hostly-accent)" }} aria-hidden />
          ) : (
            <span
              className="inline-block shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "color-mix(in srgb, var(--hostly-accent) 32%, var(--hostly-table-divider-soft))",
              }}
              aria-hidden
            />
          )}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.45, color: "var(--hostly-ink-muted)", fontWeight: 560 }}>{t("onboarding.sideLiveOpsSub")}</p>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--hostly-navy-deep)", fontWeight: 600 }}>{sideStoryLine}</p>

      {procBusy && step === 1 ? (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.42,
            fontWeight: 600,
            padding: "6px 8px",
            borderRadius: 9,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-info-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {t("onboarding.sideActivityReadingCarta")}
        </div>
      ) : null}
      {escSaving && step === 5 ? (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.42,
            fontWeight: 600,
            padding: "6px 8px",
            borderRadius: 9,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-success-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {t("onboarding.sideActivitySavingMargins")}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 9,
          fontWeight: 650,
          color: "var(--hostly-ink-faint)",
          letterSpacing: "0.085em",
          textTransform: "uppercase",
        }}
      >
        {t("onboarding.sideJourneyLegend")}
      </div>
      <div style={{ marginTop: -4 }}>
        <div
          style={{
            height: 3,
            borderRadius: 999,
            background: "color-mix(in srgb, var(--hostly-table-divider-soft) 90%, transparent)",
            overflow: "hidden",
            border: "1px solid var(--hostly-table-divider-faint)",
          }}
        >
          <div style={{ width: `${journeyPct}%`, height: "100%", borderRadius: 999, background: "var(--hostly-accent)", transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)" }} />
        </div>
      </div>

      <div
        style={{
          fontSize: 9,
          fontWeight: 650,
          marginTop: 2,
          color: "var(--hostly-ink-faint)",
          letterSpacing: "0.085em",
          textTransform: "uppercase",
          paddingTop: 6,
          borderTop: "1px solid var(--hostly-table-divider-faint)",
        }}
      >
        {t("onboarding.sideSyncedLegend")}
      </div>
      <div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "var(--hostly-table-divider-faint)",
            overflow: "hidden",
            border: "1px solid var(--hostly-table-divider-soft)",
          }}
        >
          <div
            style={{
              width: `${activationPct}%`,
              height: "100%",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--hostly-accent-soft) 100%, var(--hostly-accent))",
              transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <div style={{ marginTop: 7, fontSize: 13.5, fontWeight: 720, color: "var(--hostly-navy-deep)", letterSpacing: "-0.03em", lineHeight: 1.22 }}>
          {t("onboarding.sidePctComposite", { journey: String(journeyPct), sync: String(activationPct) })}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 620, marginTop: 4, color: "var(--hostly-navy-deep)" }}>
          {t("onboarding.sideStepCue", { n: String(Math.min(step + 1, stepLabels.length)), stepName: stepLabels[step] ?? "" })}
        </div>
        <div style={{ fontSize: 9, fontWeight: 560, marginTop: 2, color: "var(--hostly-ink-muted)", lineHeight: 1.35 }}>
          {t("onboarding.sideTrailHint", {
            current: String(Math.min(step + 1, stepLabels.length)),
            total: String(stepLabels.length),
            stepName: stepLabels[step] ?? "",
          })}
        </div>
      </div>

      <div
        style={{
          paddingTop: 8,
          borderTop: "1px solid var(--hostly-table-divider-faint)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 4 }}>
            {t("onboarding.sideLastMarked")}
          </div>
          <div style={{ fontSize: 11, fontWeight: 620, lineHeight: 1.38, color: lastMarkedLabel ? "var(--hostly-accent)" : "var(--hostly-ink-muted)" }}>
            {lastMarkedLabel ?? t("onboarding.sideLastMarkedNone")}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 6 }}>
            {t("onboarding.sideTrailEyebrow")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {stepLabels.map((lab, ti) => {
              const cpAtStep = STEP_CHECKPOINT[ti];
              const doneCp = cpAtStep != null && checkpoints[cpAtStep];
              const active = ti === step;
              return (
                <div key={lab} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 18,
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 3,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: doneCp ? "var(--hostly-accent)" : active ? "color-mix(in srgb, var(--hostly-accent) 55%, transparent)" : "var(--hostly-table-divider-faint)",
                        boxShadow: active ? "0 0 0 1px color-mix(in srgb, var(--hostly-accent) 22%, transparent)" : "none",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: active ? 680 : doneCp ? 640 : 580,
                      lineHeight: 1.34,
                      color: active ? "var(--hostly-navy-deep)" : doneCp ? "var(--hostly-accent)" : "color-mix(in srgb, var(--hostly-ink-soft) 88%, transparent)",
                      minWidth: 0,
                    }}
                  >
                    {lab}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 650, letterSpacing: "0.085em", textTransform: "uppercase", color: "var(--hostly-ink-faint)", marginBottom: 6 }}>
            {t("onboarding.sideBase")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sideChecklist.map((c) => (
              <div
                key={c.key}
                style={{
                  fontSize: 11,
                  fontWeight: 560,
                  lineHeight: 1.35,
                  color: checkpoints[c.key] ? "var(--hostly-accent)" : "color-mix(in srgb, var(--hostly-ink-soft) 75%, transparent)",
                }}
              >
                <span style={{ marginRight: 6, opacity: checkpoints[c.key] ? 1 : 0.35 }}>{checkpoints[c.key] ? "✓" : "·"}</span>
                {c.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {profile.nombre ? (
        <div
          style={{
            marginTop: 2,
            padding: "9px 10px",
            borderRadius: 10,
            border: "1px solid var(--hostly-table-divider-soft)",
            background: "var(--hostly-table-head-surface)",
            fontSize: 11,
            color: "var(--hostly-ink-muted)",
          }}
        >
          <strong style={{ color: "var(--hostly-ink-strong)", fontWeight: 650 }}>{profile.nombre}</strong>
          <div style={{ marginTop: 3, fontSize: 10 }}>{t(`onboarding.tipo.${profile.tipoNegocio}`)}</div>
        </div>
      ) : null}
      <p className="hostly-muted mb-0 text-[11px] leading-snug">{t("onboarding.sideHint")}</p>
    </div>
  );

  return (
    <div className="onboarding-scroll-shell">
      {savedHint ? (
        <div
          className="flex shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
          style={{
            border: "1px solid color-mix(in srgb, var(--hostly-accent) 24%, transparent)",
            background: "var(--hostly-success-soft)",
            color: "var(--hostly-navy-deep)",
          }}
        >
          {savedHint}
        </div>
      ) : null}
      {renderStepper()}
      <div className="onboarding-scroll-grid">
        <div
          className="hostly-surface-ice onboarding-scroll-panel rounded-[14px] border px-3 py-3 sm:px-5 sm:py-4"
          style={{ borderColor: "var(--hostly-table-divider-soft)", boxShadow: "var(--hostly-shadow-hairline)" }}
        >
          <div key={step} className="hostly-onboarding-pane onboarding-scroll-content">
            {panelMain()}
          </div>
        </div>
        <aside className="box-border max-lg:border-t max-lg:border-[var(--hostly-table-divider-soft)] max-lg:pt-3 lg:sticky lg:top-1 lg:self-start lg:rounded-[13px]" data-onboarding-context>
          <div
            className="box-border lg:rounded-[13px]"
            style={{
              border: "1px solid var(--hostly-table-divider-soft)",
              background:
                "color-mix(in srgb, var(--hostly-success-soft) 28%, color-mix(in srgb, var(--hostly-ice-100) 92%, transparent))",
              padding: "8px 10px",
              boxShadow: "var(--hostly-shadow-hairline)",
            }}
          >
            {step === 5 ? (
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--hostly-table-divider-faint)" }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 650,
                    color: "var(--hostly-ink-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.085em",
                    marginBottom: 6,
                  }}
                >
                  {t("onboarding.escSummary")}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--hostly-ink)", lineHeight: 1.5 }}>
                  <div>
                    {t("onboarding.escCoste")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{costeSum.toFixed(2)} €</strong>
                  </div>
                  <div>
                    {t("onboarding.escPvp")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{pvp.toFixed(2)} €</strong>
                  </div>
                  <div>
                    {t("onboarding.escMargin")}:{" "}
                    <strong style={{ fontWeight: 650, color: "var(--hostly-navy-deep)" }}>{mPct != null ? `${mPct.toFixed(1)}%` : "—"}</strong>
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 650, fontSize: 12, color: marginTierColor(mTier) }}>{t(`onboarding.margin.${mTier}`)}</div>
                </div>
              </div>
            ) : null}
            {sidePanel}
          </div>
        </aside>
      </div>
    </div>
  );
}

function marginTierColor(tier: string): string {
  switch (tier) {
    case "excelente":
      return "var(--hostly-accent)";
    case "bueno":
      return "color-mix(in srgb, var(--hostly-accent) 65%, var(--hostly-navy-deep))";
    case "ajustado":
      return "#b45309";
    case "peligro":
      return "#b42318";
    default:
      return "var(--hostly-ink-muted)";
  }
}
