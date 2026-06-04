"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORY_PRODUCT_FAMILY_NONE } from "@/lib/carta/category-product-family";
import {
  ensureDefaultProductFamilies,
  listenProductFamilies,
} from "@/lib/firestore/product-families";
import { PRODUCT_FAMILY_TYPE_LABELS } from "@/lib/carta/product-family-types";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";

type CategoryProductFamilySelectProps = {
  restaurantId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

const defaultClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20";

export function CategoryProductFamilySelect({
  restaurantId,
  value,
  onChange,
  disabled = false,
  className = defaultClass,
}: CategoryProductFamilySelectProps) {
  const [families, setFamilies] = useState<ProductFamilyDocument[]>([]);
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";

  useEffect(() => {
    if (!rid) {
      setFamilies([]);
      return;
    }
    let defaultsEnsured = false;
    const unsub = listenProductFamilies(
      rid,
      (list) => {
        setFamilies(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultProductFamilies(rid).catch((e) =>
            console.error("ensureDefaultProductFamilies", e),
          );
        }
      },
      (e) => console.error("listenProductFamilies", e),
    );
    return () => unsub();
  }, [rid]);

  const activeFamilies = useMemo(
    () => families.filter((f) => f.active),
    [families],
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <option value={CATEGORY_PRODUCT_FAMILY_NONE}>Sin familia de producto</option>
      {activeFamilies.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name} ({PRODUCT_FAMILY_TYPE_LABELS[f.type]})
        </option>
      ))}
    </select>
  );
}
