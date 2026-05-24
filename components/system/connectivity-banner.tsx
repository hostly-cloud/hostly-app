"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import {
  connectivityBannerMessage,
  connectivityBannerTone,
  resolveConnectivityBannerContext,
  shouldShowConnectivityBanner,
} from "@/lib/client/connectivity-state";
import { useConnectivity } from "@/components/system/connectivity-context";

const bannerBase: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 40,
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.35,
  textAlign: "center",
  borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
};

function toneStyles(tone: "ice" | "amber" | "success"): CSSProperties {
  switch (tone) {
    case "success":
      return {
        background: "rgba(220, 252, 231, 0.96)",
        color: "#047857",
        borderBottomColor: "rgba(16, 185, 129, 0.24)",
      };
    case "amber":
      return {
        background: "rgba(254, 243, 199, 0.96)",
        color: "#92400e",
        borderBottomColor: "rgba(245, 158, 11, 0.28)",
      };
    default:
      return {
        background: "rgba(239, 246, 255, 0.96)",
        color: "#315f7d",
        borderBottomColor: "rgba(49, 95, 125, 0.18)",
      };
  }
}

export function ConnectivityBanner() {
  const pathname = usePathname();
  const bannerContext = resolveConnectivityBannerContext(pathname);
  const { status, showSuccessFlash } = useConnectivity();

  if (!shouldShowConnectivityBanner(status, showSuccessFlash)) {
    return null;
  }

  const message = connectivityBannerMessage(status, showSuccessFlash, bannerContext);
  if (!message) return null;

  const tone = connectivityBannerTone(status, showSuccessFlash);

  return (
    <div
      role="status"
      aria-live="polite"
      className="hostly-connectivity-banner"
      style={{ ...bannerBase, ...toneStyles(tone) }}
    >
      {message}
    </div>
  );
}
