import { HostlySectionHeader } from "@/components/ui/hostly";

export type ComensalesHeaderBlockProps = {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  formatDateEs: (date: string) => string;
};

export function ComensalesHeaderBlock({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  formatDateEs,
}: ComensalesHeaderBlockProps) {
  return (
    <>
      <HostlySectionHeader
        title="Comensales"
        description={`Del ${formatDateEs(dateFrom)} al ${formatDateEs(dateTo)}`}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
          Desde
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 14,
            fontWeight: 700,
            outline: "none",
          }}
          aria-label="Desde"
        />
        <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
          Hasta
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 14,
            fontWeight: 700,
            outline: "none",
          }}
          aria-label="Hasta"
        />
      </div>
    </>
  );
}
