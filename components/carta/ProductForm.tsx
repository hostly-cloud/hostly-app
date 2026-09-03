"use client";

import { type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { PRODUCT_IMAGE_ACCEPT } from "@/lib/firebase/product-image-contract";

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 360,
  marginBottom: 10,
  padding: 8,
  borderRadius: 8,
  border: "1px solid #444",
  backgroundColor: "#2a2a2a",
  color: "white",
  boxSizing: "border-box",
};

export type ProductFormProps = {
  nombre: string;
  categoria: string;
  precio: string;
  imagePreviewUrl: string | null;
  /** Solo true si hay un fichero local nuevo; permite quitar la selección sin borrar la imagen guardada. */
  pendingImageFile: boolean;
  /** Deshabilita campos de texto y carga inicial (no el envío por sí solo). */
  fieldsDisabled: boolean;
  /** Solo el botón de guardar (p. ej. true mientras saving). */
  submitDisabled: boolean;
  onNombreChange: (value: string) => void;
  onCategoriaChange: (value: string) => void;
  /** Si se define, sustituye el input de categoría (p. ej. selector Firestore). */
  categorySlot?: ReactNode;
  onPrecioChange: (value: string) => void;
  /** Puede ser async (copia estable del archivo en el padre). */
  onImageFileChange: (file: File | null) => void | Promise<void>;
  onSubmit: () => void;
  submitLabel: string;
};

export function ProductForm({
  nombre,
  categoria,
  precio,
  imagePreviewUrl,
  pendingImageFile,
  fieldsDisabled,
  submitDisabled,
  onNombreChange,
  onCategoriaChange,
  categorySlot,
  onPrecioChange,
  onImageFileChange,
  onSubmit,
  submitLabel,
}: ProductFormProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>Nuevo producto</div>
      <label style={{ fontSize: 14 }}>
        Nombre
        <input
          type="text"
          value={nombre}
          disabled={fieldsDisabled}
          onChange={(e) => onNombreChange(e.target.value)}
          style={inputStyle}
        />
      </label>
      {categorySlot != null ? (
        categorySlot
      ) : (
        <label style={{ fontSize: 14 }}>
          Categoría
          <select
            value={categoria}
            disabled={fieldsDisabled}
            onChange={(e) => onCategoriaChange(e.target.value)}
            style={inputStyle}
          >
            <option value="">Seleccionar categoría</option>
          </select>
        </label>
      )}
      <label style={{ fontSize: 14 }}>
        Precio
        <input
          type="number"
          step="any"
          value={precio}
          disabled={fieldsDisabled}
          onChange={(e) => onPrecioChange(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ fontSize: 14, display: "block", marginBottom: 8 }}>
        Imagen (opcional)
        <input
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          disabled={fieldsDisabled}
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            e.target.value = "";
            void Promise.resolve(onImageFileChange(selected));
          }}
          style={{ ...inputStyle, padding: 6 }}
        />
      </label>
      {imagePreviewUrl ? (
        <div style={{ marginBottom: 12 }}>
          <Image
            src={imagePreviewUrl}
            alt="Vista previa"
            width={200}
            height={200}
            unoptimized
            style={{
              maxWidth: 200,
              maxHeight: 200,
              borderRadius: 8,
              objectFit: "cover",
              border: "1px solid #444",
            }}
          />
          {pendingImageFile ? (
            <div>
              <button
                type="button"
                disabled={fieldsDisabled}
                onClick={() => onImageFileChange(null)}
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  background: "#333",
                  color: "#fff",
                  cursor: fieldsDisabled ? "not-allowed" : "pointer",
                }}
              >
                Quitar imagen seleccionada
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onSubmit()}
        disabled={submitDisabled}
        style={{
          backgroundColor: "#27ae60",
          color: "white",
          padding: 10,
          borderRadius: 8,
          border: "none",
          cursor: submitDisabled ? "not-allowed" : "pointer",
          opacity: submitDisabled ? 0.6 : 1,
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
