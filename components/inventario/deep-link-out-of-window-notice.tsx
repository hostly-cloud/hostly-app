import type { CSSProperties } from "react";

export const HOSTLY_DEEP_LINK_OUT_OF_WINDOW_NOTICE =
  "Documento enlazado cargado fuera de la ventana reciente";

const noticeStyle: CSSProperties = {
  margin: 0,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(147, 197, 253, 0.45)",
  background: "rgba(191, 219, 254, 0.22)",
  fontSize: 12,
  fontWeight: 600,
  color: "#1e40af",
};

export function DeepLinkOutOfWindowNotice({
  message = HOSTLY_DEEP_LINK_OUT_OF_WINDOW_NOTICE,
}: {
  message?: string;
}) {
  return (
    <p role="status" style={noticeStyle}>
      {message}
    </p>
  );
}

export function DeepLinkContextNotice({ message }: { message: string }) {
  return (
    <p
      role="status"
      style={{
        ...noticeStyle,
        color: "#64748b",
        background: "rgba(148, 163, 184, 0.12)",
        borderColor: "rgba(148, 163, 184, 0.28)",
      }}
    >
      {message}
    </p>
  );
}
