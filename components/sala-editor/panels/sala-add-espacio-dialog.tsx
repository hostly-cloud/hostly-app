"use client";

import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import {
  SALA_ESPACIO_TYPE_OPTIONS,
  getSalaEspacioTypeOption,
} from "@/lib/sala-editor/catalog/espacio-types";
import { useEffect, useState } from "react";

export type SalaAddEspacioDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    tipo: SalaEspacioType;
    color: string;
  }) => void;
};

export function SalaAddEspacioDialog({
  open,
  onClose,
  onCreate,
}: SalaAddEspacioDialogProps) {
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<SalaEspacioType>("sala");
  const [color, setColor] = useState(getSalaEspacioTypeOption("sala").defaultColor);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTipo("sala");
    setColor(getSalaEspacioTypeOption("sala").defaultColor);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleTipoChange = (next: SalaEspacioType) => {
    setTipo(next);
    const option = getSalaEspacioTypeOption(next);
    setColor(option.defaultColor);
    if (!name.trim()) setName(option.label);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, tipo, color });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Añadir espacio"
        className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
      >
        <h3 className="text-lg font-extrabold text-slate-900">Añadir espacio</h3>
        <p className="mt-1 text-sm text-slate-500">
          Define el espacio antes de construir paredes o mesas.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
              Nombre
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Sala principal"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)] focus:ring-2 focus:ring-[var(--hostly-accent-soft)]"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
              Tipo
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {SALA_ESPACIO_TYPE_OPTIONS.map((option) => {
                const active = tipo === option.type;
                return (
                  <label
                    key={option.type}
                    className={[
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition",
                      active
                        ? "border-[color-mix(in_srgb,var(--hostly-accent)_42%,#cbd5e1)] bg-[var(--hostly-accent-soft)]"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="espacio-tipo"
                      value={option.type}
                      checked={active}
                      onChange={() => handleTipoChange(option.type)}
                      className="sr-only"
                    />
                    <span aria-hidden>{option.icon}</span>
                    <span className="text-sm font-bold text-slate-800">
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
              Color
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)]"
              />
            </div>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={handleSubmit}
            className="inline-flex min-h-[40px] items-center rounded-xl bg-[var(--hostly-accent)] px-4 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(49,95,125,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
