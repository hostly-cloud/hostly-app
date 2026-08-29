"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { RestaurantLogoMark } from "@/components/restaurant/restaurant-logo-mark";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyInput,
  HostlyLoadingState,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
} from "@/components/ui/hostly";
import { createStableImageFile } from "@/lib/firebase/product-image-storage";
import { uploadRestaurantLogo } from "@/lib/firebase/restaurant-logo-storage";
import {
  DEFAULT_RESTAURANT_CURRENCY,
  DEFAULT_RESTAURANT_TIMEZONE,
  emptyRestaurantDocument,
  getRestaurantById,
  type RestaurantDocument,
} from "@/lib/firestore/restaurants";
import { saveRestaurantProfileWithUserSync } from "@/lib/firestore/save-restaurant-profile";
import {
  currencySelectOptions,
  RESTAURANT_BUSINESS_TYPE_OPTIONS,
  timezoneSelectOptions,
} from "@/lib/firestore/restaurant-profile-options";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";

type EmpresaFormState = {
  name: string;
  businessType: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  currency: string;
  logoUrl: string;
  logoPath: string;
};

function documentToForm(doc: RestaurantDocument): EmpresaFormState {
  return {
    name: doc.name,
    businessType: doc.businessType,
    phone: doc.phone,
    email: doc.email,
    website: doc.website,
    taxId: doc.taxId,
    address: doc.address,
    city: doc.city,
    country: doc.country,
    timezone: doc.timezone || DEFAULT_RESTAURANT_TIMEZONE,
    currency: doc.currency || DEFAULT_RESTAURANT_CURRENCY,
    logoUrl: doc.logoUrl ?? "",
    logoPath: doc.logoPath ?? "",
  };
}

function emptyForm(restaurantId: string): EmpresaFormState {
  return documentToForm(emptyRestaurantDocument(restaurantId));
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <HostlySurface variant="flat" className="p-4 sm:p-5">
      <HostlySectionHeader title={title} titleVariant="section" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </HostlySurface>
  );
}

export default function ConfigEmpresaPage() {
  const { user, restaurantId: profileRestaurantId, profileReady, refreshProfile } = useAuth();
  const { can } = useHostlyCapabilities();
  const canEditEmpresa = can("settings.manage");
  const restaurantId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId),
    [profileReady, profileRestaurantId],
  );

  const [form, setForm] = useState<EmpresaFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const timezoneOptions = useMemo(
    () => timezoneSelectOptions(form?.timezone ?? DEFAULT_RESTAURANT_TIMEZONE),
    [form?.timezone],
  );

  const currencyOptions = useMemo(
    () => currencySelectOptions(form?.currency ?? DEFAULT_RESTAURANT_CURRENCY),
    [form?.currency],
  );

  const loadProfile = useCallback(async () => {
    if (!restaurantId) {
      setForm(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const doc = await getRestaurantById(restaurantId);
      setForm(doc ? documentToForm(doc) : emptyForm(restaurantId));
    } catch (e) {
      console.error("[config empresa] load failed", e);
      setError("No se pudo cargar el perfil del restaurante.");
      setForm(emptyForm(restaurantId));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!profileReady) return;
    void loadProfile();
  }, [profileReady, loadProfile]);

  const patchField = useCallback(
    <K extends keyof EmpresaFormState>(key: K, value: EmpresaFormState[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const handleLogoFile = useCallback(
    async (file: File | null) => {
      if (!file || !restaurantId || !canEditEmpresa) return;
      setLogoUploading(true);
      setError(null);
      try {
        const stable = await createStableImageFile(file);
        const previousPath = form?.logoPath;
        const { path, url } = await uploadRestaurantLogo(restaurantId, stable, previousPath);
        setForm((prev) =>
          prev
            ? {
                ...prev,
                logoUrl: url,
                logoPath: path,
              }
            : prev,
        );
        setNotice("Logo preparado. Pulsa «Guardar cambios» para aplicarlo al restaurante.");
        window.setTimeout(() => setNotice(null), 3200);
      } catch (e) {
        console.error("[config empresa] logo upload failed", e);
        setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
      } finally {
        setLogoUploading(false);
        if (logoInputRef.current) logoInputRef.current.value = "";
      }
    },
    [canEditEmpresa, form?.logoPath, restaurantId],
  );

  const handleSave = useCallback(async () => {
    if (!canEditEmpresa || !restaurantId || !user?.uid || !form) return;

    const name = form.name.trim();
    if (!name) {
      setError("Indica el nombre comercial del restaurante.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await saveRestaurantProfileWithUserSync(restaurantId, user.uid, {
        name,
        businessType: form.businessType.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        taxId: form.taxId.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        timezone: form.timezone.trim() || DEFAULT_RESTAURANT_TIMEZONE,
        currency: form.currency.trim() || DEFAULT_RESTAURANT_CURRENCY,
        logoUrl: form.logoUrl.trim(),
        logoPath: form.logoPath.trim(),
      });
      refreshProfile();
      setNotice("Cambios guardados.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      console.error("[config empresa] save failed", e);
      setError("No se pudo guardar el perfil. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [canEditEmpresa, form, refreshProfile, restaurantId, user?.uid]);

  return (
    <div className="hostly-company-profile-page hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="hostly-company-profile-content mx-auto flex w-full flex-col gap-4 pb-24">
        <HostlySectionHeader
          title="Empresa"
          description="Mantén actualizados los datos, la identidad y la configuración regional del restaurante."
        />

        {!profileReady || loading ? (
          <HostlyLoadingState embedded label="Cargando perfil del restaurante…" />
        ) : null}

        {!restaurantId ? (
          <HostlyAlert tone="warning">
            No hay un restaurante asignado a tu cuenta.
          </HostlyAlert>
        ) : null}

        {error ? (
          <HostlyAlert tone="danger">{error}</HostlyAlert>
        ) : null}

        {notice ? (
          <HostlyAlert tone="success">{notice}</HostlyAlert>
        ) : null}

        {restaurantId && form && !loading && !canEditEmpresa ? (
          <HostlyAlert tone="info" title="Modo lectura">
            Solo el propietario o administrador puede editar el perfil del restaurante. Estás viendo la
            información en modo lectura.
          </HostlyAlert>
        ) : null}

        {restaurantId && form && !loading ? (
          <>
            <HostlySurface variant="ice" className="p-4 sm:p-5">
              <HostlySectionHeader title="Logo del restaurante" titleVariant="section" />
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <RestaurantLogoMark
                    name={form.name || "Mi restaurante"}
                    logoUrl={form.logoUrl || null}
                    size={72}
                  />
                  <p className="hostly-muted m-0 max-w-sm text-sm leading-snug">
                    {form.logoUrl
                      ? "Este logo se mostrará en el dashboard y futuras vistas del restaurante."
                      : "Aún no hay logo. Sube una imagen cuadrada o circular (PNG, JPG o WebP, máx. 3 MB)."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={!canEditEmpresa || logoUploading || saving}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void handleLogoFile(f);
                    }}
                  />
                  {canEditEmpresa ? (
                    <HostlyButton
                      variant="secondary"
                      type="button"
                      disabled={logoUploading || saving}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoUploading ? "Subiendo…" : "Subir logo"}
                    </HostlyButton>
                  ) : null}
                </div>
              </div>
            </HostlySurface>

            <FormSection title="Información del restaurante">
              <HostlyField label="Nombre comercial">
                <HostlyInput
                  value={form.name}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="organization"
                  placeholder="Mi restaurante"
                  onChange={(e) => patchField("name", e.target.value)}
                />
              </HostlyField>
              <HostlyField label="Tipo de negocio">
                <HostlySelect
                  value={form.businessType}
                  disabled={saving || !canEditEmpresa}
                  onChange={(e) => patchField("businessType", e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {RESTAURANT_BUSINESS_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </HostlySelect>
              </HostlyField>
            </FormSection>

            <FormSection title="Contacto">
              <HostlyField label="Teléfono">
                <HostlyInput
                  type="tel"
                  value={form.phone}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="tel"
                  placeholder="+34 600 000 000"
                  onChange={(e) => patchField("phone", e.target.value)}
                />
              </HostlyField>
              <HostlyField label="Email">
                <HostlyInput
                  type="email"
                  value={form.email}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="email"
                  placeholder="contacto@restaurante.com"
                  onChange={(e) => patchField("email", e.target.value)}
                />
              </HostlyField>
              <HostlyField label="Sitio web" className="sm:col-span-2">
                <HostlyInput
                  type="url"
                  value={form.website}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="url"
                  placeholder="https://"
                  onChange={(e) => patchField("website", e.target.value)}
                />
              </HostlyField>
            </FormSection>

            <FormSection title="Datos fiscales">
              <HostlyField label="CIF / NIF">
                <HostlyInput
                  value={form.taxId}
                  disabled={saving || !canEditEmpresa}
                  placeholder="B12345678"
                  onChange={(e) => patchField("taxId", e.target.value)}
                />
              </HostlyField>
            </FormSection>

            <FormSection title="Dirección">
              <HostlyField label="Dirección" className="sm:col-span-2">
                <HostlyInput
                  value={form.address}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="street-address"
                  placeholder="Calle, número, piso…"
                  onChange={(e) => patchField("address", e.target.value)}
                />
              </HostlyField>
              <HostlyField label="Ciudad">
                <HostlyInput
                  value={form.city}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="address-level2"
                  placeholder="Madrid"
                  onChange={(e) => patchField("city", e.target.value)}
                />
              </HostlyField>
              <HostlyField label="País">
                <HostlyInput
                  value={form.country}
                  disabled={saving || !canEditEmpresa}
                  autoComplete="country-name"
                  placeholder="España"
                  onChange={(e) => patchField("country", e.target.value)}
                />
              </HostlyField>
            </FormSection>

            <FormSection title="Configuración regional">
              <HostlyField label="Zona horaria">
                <HostlySelect
                  value={form.timezone}
                  disabled={saving || !canEditEmpresa}
                  onChange={(e) => patchField("timezone", e.target.value)}
                >
                  {timezoneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </HostlySelect>
              </HostlyField>
              <HostlyField label="Moneda">
                <HostlySelect
                  value={form.currency}
                  disabled={saving || !canEditEmpresa}
                  onChange={(e) => patchField("currency", e.target.value)}
                >
                  {currencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </HostlySelect>
              </HostlyField>
            </FormSection>
          </>
        ) : null}
      </div>

      {restaurantId && form && !loading && canEditEmpresa ? (
        <div className="hostly-company-profile-savebar sticky bottom-0 z-10 border-t border-slate-200/90 bg-[rgba(247,252,255,0.96)] px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="hostly-company-profile-savebar__inner mx-auto flex w-full justify-end">
            <HostlyButton variant="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </HostlyButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
