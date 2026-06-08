"use client";

import { AlertCircle, Info } from "lucide-react";
import { HostlySurface, hostlyCx } from "@/components/ui/hostly";
import type { MenuImportOperationalWarning } from "@/lib/carta/menu-import-operational-warnings-types";

type ImportMenuOperationalWarningsProps = {
  warnings: MenuImportOperationalWarning[];
  className?: string;
};

function toneStyles(tone: MenuImportOperationalWarning["tone"]) {
  if (tone === "caution") {
    return {
      surface: "border-amber-200/90 bg-amber-50/85",
      icon: "text-amber-700",
      text: "text-amber-950",
    };
  }
  return {
    surface: "border-sky-200/90 bg-sky-50/80",
    icon: "text-sky-700",
    text: "text-sky-950",
  };
}

export function ImportMenuOperationalWarnings({
  warnings,
  className,
}: ImportMenuOperationalWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <HostlySurface variant="flat" className={hostlyCx("space-y-2 p-3 sm:p-3.5", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--hostly-ink-muted)]">
        Avisos del análisis
      </p>
      <ul className="space-y-1.5">
        {warnings.map((warning) => {
          const styles = toneStyles(warning.tone);
          const Icon = warning.tone === "caution" ? AlertCircle : Info;
          return (
            <li
              key={warning.id}
              className={hostlyCx(
                "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs leading-snug",
                styles.surface,
              )}
            >
              <Icon className={hostlyCx("mt-0.5 h-3.5 w-3.5 shrink-0", styles.icon)} aria-hidden />
              <span className={hostlyCx("font-medium", styles.text)}>{warning.message}</span>
            </li>
          );
        })}
      </ul>
    </HostlySurface>
  );
}
