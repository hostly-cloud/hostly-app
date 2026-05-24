"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export default function InviteLandingClient({ token }: { token: string }) {
  const { t } = useI18n();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-[color:var(--hostly-table-divider-soft)] bg-[var(--hostly-surface-card-solid)] p-6 shadow-[var(--hostly-shadow-hairline)]">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hostly-accent)]">
          Hostly
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[color:var(--hostly-ink-strong)]">
          {t("invites.landingTitle")}
        </h1>
        <p className="hostly-muted mt-3 text-sm leading-relaxed">{t("invites.landingBody")}</p>
        {token ? (
          <p className="mt-4 rounded-lg bg-[color-mix(in_srgb,var(--hostly-info-soft)_70%,transparent)] px-3 py-2 text-[11px] leading-snug text-[color:var(--hostly-navy-deep)]">
            {t("invites.landingTokenHint")}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="hostly-button-primary px-4 py-2 text-sm font-semibold">
            {t("invites.landingLoginCta")}
          </Link>
          <Link href="/register" className="hostly-button-secondary px-4 py-2 text-sm font-semibold">
            {t("invites.landingRegisterCta")}
          </Link>
        </div>
      </div>
    </main>
  );
}
