"use client";

import { useState, type ReactNode } from "react";

export function ProductFormDrawerBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="hostly-product-form-drawer-block">
      <h3 className="hostly-carta-config-section-title">{title}</h3>
      {hint ? <p className="hostly-carta-config-form-hint">{hint}</p> : null}
      <div className="hostly-product-form-drawer-block__fields">{children}</div>
    </section>
  );
}

/** Bloque visual del drawer de producto (Carta / Producción / Producto). Solo presentación. */
export function ProductFormDrawerZone({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["hostly-product-form-drawer-zone", className].filter(Boolean).join(" ")}
    >
      <header className="hostly-product-form-drawer-zone__header">
        <h3 className="hostly-product-form-drawer-zone__title">{title}</h3>
        {description ? (
          <p className="hostly-product-form-drawer-zone__description">{description}</p>
        ) : null}
      </header>
      <div className="hostly-product-form-drawer-zone__body">{children}</div>
    </section>
  );
}

/** Subgrupo visual dentro de un bloque del drawer (solo presentación). */
export function ProductFormDrawerSubgroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="hostly-product-form-drawer-subgroup">
      <header className="hostly-product-form-drawer-subgroup__header">
        <h4 className="hostly-product-form-drawer-subgroup__title">{title}</h4>
        {description ? (
          <p className="hostly-product-form-drawer-subgroup__description">{description}</p>
        ) : null}
      </header>
      <div className="hostly-product-form-drawer-subgroup__fields">{children}</div>
    </div>
  );
}

export function ProductFormDrawerCollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={["hostly-product-form-drawer-block", className].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="hostly-product-form-drawer-collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="hostly-carta-config-section-title">{title}</span>
          {hint && !open ? (
            <span className="hostly-carta-config-form-hint">{hint}</span>
          ) : null}
        </span>
        <span className="hostly-product-form-drawer-collapsible__chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="hostly-product-form-drawer-block__fields">{children}</div>
      ) : null}
    </section>
  );
}
