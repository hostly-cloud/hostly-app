"use client";

import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";

export default function UsuariosPage() {
  const { t } = useI18n();

  return (
    <ModulePageShell title={t("users.title")} subtitle={t("users.subtitle")}>
      <div
        style={{
          backgroundColor: "#1e293b",
          borderRadius: 16,
          padding: "24px 28px",
          maxWidth: 560,
          border: "1px solid #334155",
        }}
      >
        <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>{t("users.body")}</p>
      </div>
    </ModulePageShell>
  );
}
