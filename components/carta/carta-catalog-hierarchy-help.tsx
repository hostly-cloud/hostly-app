"use client";

export type CartaCatalogHierarchyFocus = "menu-family" | "category";

export type CartaCatalogHierarchyHelpProps = {
  /** Resalta el nivel que explica la pantalla actual. */
  focus: CartaCatalogHierarchyFocus;
};

const LEVELS = [
  { id: "menu-family" as const, label: "Familias de menú" },
  { id: "category" as const, label: "Categorías de carta" },
  { id: "product" as const, label: "Productos" },
] as const;

const EXAMPLES = [
  { family: "Pizzas", category: "Pizze Classico", product: "Margherita" },
  { family: "Pizzas", category: "Pizze Speciali", product: "Diavola" },
] as const;

/**
 * Bloque estático de jerarquía carta (solo lectura, sin datos de Firestore).
 */
export function CartaCatalogHierarchyHelp({ focus }: CartaCatalogHierarchyHelpProps) {
  return (
    <div className="hostly-carta-hierarchy-help" aria-label="Jerarquía del catálogo">
      <div className="hostly-carta-hierarchy-help__levels">
        {LEVELS.map((level, index) => (
          <div key={level.id} className="hostly-carta-hierarchy-help__level-row">
            {index > 0 ? (
              <span className="hostly-carta-hierarchy-help__arrow" aria-hidden>
                ↓
              </span>
            ) : null}
            <span
              className={[
                "hostly-carta-hierarchy-help__level",
                level.id === focus ? "is-focus" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {level.label}
            </span>
          </div>
        ))}
      </div>
      <div className="hostly-carta-hierarchy-help__examples">
        <p className="hostly-carta-hierarchy-help__examples-title">Ejemplo</p>
        <ul className="hostly-carta-hierarchy-help__examples-list">
          {EXAMPLES.map((row) => (
            <li key={`${row.category}-${row.product}`}>
              <span className="hostly-carta-hierarchy-help__example-part">{row.family}</span>
              <span className="hostly-carta-hierarchy-help__example-sep" aria-hidden>
                ↓
              </span>
              <span className="hostly-carta-hierarchy-help__example-part">{row.category}</span>
              <span className="hostly-carta-hierarchy-help__example-sep" aria-hidden>
                ↓
              </span>
              <span className="hostly-carta-hierarchy-help__example-part">{row.product}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
