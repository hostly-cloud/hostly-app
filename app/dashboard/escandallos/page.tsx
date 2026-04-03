"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ModulePageShell from "@/components/module-page-shell";
import { supabase } from "@/lib/supabase";

type EscandalloRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

type DraftById = Record<
  string,
  {
    coste_total: string;
    precio_venta: string;
  }
>;

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

export default function EscandallosPage() {
  const [items, setItems] = useState<EscandalloRow[]>([]);
  const [drafts, setDrafts] = useState<DraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setError(null);
    const { data, error } = await supabase
      .from("escandallos")
      .select("id, nombre_plato, coste_total, precio_venta")
      .order("nombre_plato", { ascending: true, nullsFirst: false });

    if (error) {
      setError(error.message);
      setItems([]);
      return;
    }

    const baseRows = (data ?? []) as EscandalloRow[];
    let overrides: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
      overrides = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      overrides = {};
    }

    const rows = baseRows.map((r) => {
      const key = String(r.id);
      const ov = overrides[key];
      return typeof ov === "number" && Number.isFinite(ov) ? { ...r, coste_total: ov } : r;
    });

    setItems(rows);
    setDrafts((prev) => {
      const next: DraftById = { ...prev };
      for (const r of rows) {
        const key = String(r.id);
        if (!next[key]) {
          next[key] = {
            coste_total: r.coste_total == null ? "" : formatMoney2OrDash(r.coste_total),
            precio_venta: r.precio_venta == null ? "" : formatMoneyUpTo2OrDash(r.precio_venta),
          };
        }
      }
      return next;
    });
  }

  function parseNullableNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function roundTo(n: number, decimals: number): number {
    const f = 10 ** decimals;
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function formatMoney2OrDash(value: number | null | undefined): string {
    if (value == null) return "-";
    if (!Number.isFinite(value)) return "-";
    return roundTo(value, 2).toFixed(2);
  }

  /** Alias por si el JSX o HMR aún referencian el nombre antiguo (evita ReferenceError). */
  function formatMoneyOrDash(value: number | null | undefined): string {
    return formatMoney2OrDash(value);
  }

  function formatMoneyUpTo2OrDash(value: number | null | undefined): string {
    if (value == null) return "-";
    if (!Number.isFinite(value)) return "-";
    const s = roundTo(value, 2).toFixed(2);
    return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function formatMarginOrDash(costeTotal: number | null, precioVenta: number | null): string {
    if (precioVenta == null || precioVenta === 0) return "-";
    if (costeTotal == null) return "-";
    const m = ((precioVenta - costeTotal) / precioVenta) * 100;
    if (!Number.isFinite(m)) return "-";
    return `${m.toFixed(1)}%`;
  }

  function updateDraft(id: string | number, field: "coste_total" | "precio_venta", value: string) {
    const key = String(id);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        coste_total: prev[key]?.coste_total ?? "",
        precio_venta: prev[key]?.precio_venta ?? "",
        [field]: value,
      },
    }));
  }

  async function guardarFila(id: string | number) {
    const key = String(id);
    setError(null);
    setSavingById((prev) => ({ ...prev, [key]: true }));

    try {
      const draft = drafts[key] ?? { coste_total: "", precio_venta: "" };
      const coste_total = parseNullableNumber(draft.coste_total);
      const precio_venta = parseNullableNumber(draft.precio_venta);

      const { error } = await supabase
        .from("escandallos")
        .update({ coste_total, precio_venta })
        .eq("id", id);

      if (error) {
        setError(error.message);
        return;
      }

      if (coste_total != null) {
        try {
          const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
          const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
          if (parsed[key] != null) {
            delete parsed[key];
            localStorage.setItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY, JSON.stringify(parsed));
          }
        } catch {
          // noop
        }
      }

      setItems((prev) =>
        prev.map((r) => (String(r.id) === key ? { ...r, coste_total, precio_venta } : r)),
      );
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <ModulePageShell
      title="Escandallos"
      subtitle="Edita el coste y el precio de venta. El margen se calcula automáticamente."
      maxWidth={1180}
      headerRight={
        <button
          onClick={cargar}
          type="button"
          style={{
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f8fafc",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Recargar
        </button>
      }
    >
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        {error ? (
          <div
            style={{
              border: "1px solid rgba(248, 113, 113, 0.45)",
              background: "rgba(127, 29, 29, 0.4)",
              color: "#fecaca",
              padding: "12px 14px",
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            width: "100%",
            border: "1px solid #334155",
            borderRadius: 14,
            overflow: "hidden",
            background: "#f1f5f9",
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    fontWeight: 600,
                    padding: "14px 16px",
                    borderBottom: "1px solid #cbd5e1",
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                  }}
                >
                  Nombre
                </th>
                <th
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    padding: "14px 16px",
                    borderBottom: "1px solid #cbd5e1",
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    width: "18%",
                  }}
                >
                  Coste (€)
                </th>
                <th
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    padding: "14px 16px",
                    borderBottom: "1px solid #cbd5e1",
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    width: "18%",
                  }}
                >
                  Venta (€)
                </th>
                <th
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    padding: "14px 16px",
                    borderBottom: "1px solid #cbd5e1",
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    width: "14%",
                  }}
                >
                  Margen (%)
                </th>
                <th
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    padding: "14px 16px",
                    borderBottom: "1px solid #cbd5e1",
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    width: "15%",
                  }}
                >
                  Guardar
                </th>
              </tr>
            </thead>

            <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 20,
                    color: "#475569",
                    background: "#fff",
                    fontSize: 15,
                  }}
                >
                  No hay platos en la tabla <code style={{ color: "#0f172a", background: "#e2e8f0", padding: "2px 6px", borderRadius: 6 }}>escandallos</code>.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const key = String(item.id);
                const draft = drafts[key] ?? {
                  coste_total: item.coste_total == null ? "" : String(item.coste_total),
                  precio_venta: item.precio_venta == null ? "" : String(item.precio_venta),
                };

                const costeN = parseNullableNumber(draft.coste_total);
                const ventaN = parseNullableNumber(draft.precio_venta);
                const marginText = formatMarginOrDash(costeN, ventaN);

                return (
                  <tr key={key} style={{ background: "#fff" }}>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #e2e8f0",
                        verticalAlign: "middle",
                      }}
                    >
                      <Link
                        href={`/dashboard/escandallos/${encodeURIComponent(String(item.id))}`}
                        style={{ textDecoration: "none", color: "#2563eb" }}
                      >
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{item.nombre_plato ?? "-"}</div>
                      </Link>
                    </td>

                    <td
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #e2e8f0",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={draft.coste_total}
                        onChange={(e) => updateDraft(item.id, "coste_total", e.target.value)}
                        placeholder={item.coste_total == null ? "" : formatMoney2OrDash(item.coste_total)}
                        aria-label={`Coste total para ${item.nombre_plato ?? "plato"}`}
                        style={{
                          width: "100%",
                          maxWidth: 152,
                          marginLeft: "auto",
                          display: "block",
                          textAlign: "right",
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          outline: "none",
                          backgroundColor: "#fff",
                          color: "#0f172a",
                          fontSize: 14,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #e2e8f0",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={draft.precio_venta}
                        onChange={(e) => updateDraft(item.id, "precio_venta", e.target.value)}
                        placeholder={item.precio_venta == null ? "" : formatMoneyUpTo2OrDash(item.precio_venta)}
                        aria-label={`Precio de venta para ${item.nombre_plato ?? "plato"}`}
                        style={{
                          width: "100%",
                          maxWidth: 152,
                          marginLeft: "auto",
                          display: "block",
                          textAlign: "right",
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #cbd5e1",
                          outline: "none",
                          backgroundColor: "#fff",
                          color: "#0f172a",
                          fontSize: 14,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #e2e8f0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: marginText === "-" ? "#94a3b8" : "#0f172a",
                        fontWeight: 600,
                        fontSize: 14,
                        verticalAlign: "middle",
                      }}
                    >
                      {marginText}
                    </td>

                    <td
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #e2e8f0",
                        textAlign: "right",
                        verticalAlign: "middle",
                      }}
                    >
                      <button
                        onClick={() => guardarFila(item.id)}
                        type="button"
                        disabled={Boolean(savingById[key])}
                        style={{
                          border: "1px solid #64748b",
                          background: savingById[key] ? "#e2e8f0" : "#f8fafc",
                          color: "#0f172a",
                          padding: "8px 14px",
                          borderRadius: 10,
                          cursor: savingById[key] ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {savingById[key] ? "Guardando..." : "Guardar"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </ModulePageShell>
  );
}