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
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em" }}>Comensales</div>
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
          Del {formatDateEs(dateFrom)} al {formatDateEs(dateTo)}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#94a3b8" }}>
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
            background: "rgba(15, 23, 42, 0.5)",
            color: "#f8fafc",
            fontSize: 14,
            fontWeight: 700,
            outline: "none",
          }}
          aria-label="Desde"
        />
        <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#94a3b8" }}>
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
            background: "rgba(15, 23, 42, 0.5)",
            color: "#f8fafc",
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
