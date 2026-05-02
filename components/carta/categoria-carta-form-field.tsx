"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { CartaCategoria } from "@/lib/carta-categorias/types";

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "stretch",
};

export function CategoriaCartaFormField({
  labelStyle,
  inputStyle,
  t,
  categorias,
  selectedId,
  onSelectId,
  onOpenAddCategory,
}: {
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
  t: (key: string) => string;
  categorias: CartaCategoria[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onOpenAddCategory: () => void;
}) {
  const sorted = useMemo(
    () => [...categorias].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [categorias],
  );

  return (
    <div>
      <label style={labelStyle}>{t("carta.fieldCategoria")}</label>
      <div style={rowStyle}>
        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onSelectId(v === "" ? null : v);
          }}
          style={{ ...inputStyle, flex: "1 1 200px", minHeight: 52, cursor: "pointer" }}
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
          style={{
            flex: "0 0 auto",
            minHeight: 52,
            padding: "0 16px",
            borderRadius: 10,
            border: "1px solid rgba(56, 189, 248, 0.45)",
            background: "rgba(8,47,73,0.25)",
            color: "#7dd3fc",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("cartaCategories.addFromForm")}
        </button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>{t("carta.fieldCategoriaHint")}</p>
    </div>
  );
}
