"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

const blockTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#94a3b8",
};

const blockHintStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.35,
};

const blockShellStyle: CSSProperties = {
  padding: "12px 12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(15, 23, 42, 0.35)",
};

const toggleBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};

const chevronStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1,
  color: "#64748b",
};

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
    <section style={blockShellStyle}>
      <h3 style={blockTitleStyle}>{title}</h3>
      {hint ? <p style={blockHintStyle}>{hint}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 12 }}>
        {children}
      </div>
    </section>
  );
}

export function ProductFormDrawerCollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section style={blockShellStyle}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={toggleBtnStyle}
      >
        <span>
          <span style={{ ...blockTitleStyle, display: "block" }}>{title}</span>
          {hint && !open ? <span style={{ ...blockHintStyle, display: "block" }}>{hint}</span> : null}
        </span>
        <span style={chevronStyle} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 12 }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
