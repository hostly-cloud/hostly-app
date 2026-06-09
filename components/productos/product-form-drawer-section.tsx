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
