"use client";

import { useMemo } from "react";
import type { CartaCategoria } from "@/lib/carta-categorias/types";

const inputClass = "hostly-input hostly-carta-config-field-input";

export function CategoriaCartaFormField({
  t,
  categorias,
  selectedId,
  onSelectId,
  onOpenAddCategory,
  hintClassName = "hostly-carta-config-form-hint",
}: {
  t: (key: string) => string;
  categorias: CartaCategoria[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onOpenAddCategory: () => void;
  hintClassName?: string;
}) {
  const sorted = useMemo(
    () =>
      [...categorias].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [categorias],
  );

  return (
    <div className="hostly-carta-config-form-field">
      <span className="hostly-carta-config-form-label">{t("carta.fieldCategoria")}</span>
      <div className="hostly-product-form-drawer-categoria-row">
        <select
          className={inputClass}
          value={selectedId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onSelectId(v === "" ? null : v);
          }}
          aria-label={t("carta.fieldCategoria")}
        >
          <option value="">{t("cartaCategories.selectNone")}</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.isActive ? ` (${t("cartaCategories.inactiveShort")})` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenAddCategory}
          className="hostly-button-secondary hostly-button-compact hostly-product-form-drawer-categoria-add"
        >
          {t("cartaCategories.addFromForm")}
        </button>
      </div>
      <p className={hintClassName}>{t("carta.fieldCategoriaHint")}</p>
    </div>
  );
}
