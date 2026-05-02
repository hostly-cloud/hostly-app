"use client";

const OPTIONS = [
  { id: "todos", label: "Todos" },
  { id: "bebida", label: "Bebida" },
  { id: "comida", label: "Comida" },
  { id: "postre", label: "Postre" },
] as const;

export type CategoryFilterProps = {
  value: string;
  onChange: (value: string) => void;
};

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          style={{
            backgroundColor: value === opt.id ? "#16a34a" : "#222",
            color: "white",
            padding: 8,
            borderRadius: 8,
            marginRight: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
