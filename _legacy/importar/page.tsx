"use client";

import { useI18n } from "@/components/i18n-provider";
import MenuPhotoImportFlow from "@/components/carta/menu-photo-import-flow";
import ModulePageShell from "@/components/module-page-shell";

export default function CartaImportarFotoPage() {
  const { t } = useI18n();

  return (
    <ModulePageShell
      title={t("cartaImport.pageTitle")}
      subtitle={t("cartaImport.pageSubtitle")}
      maxWidth={1180}
      compactLayout
      operationalFocus
      lockViewport
      fitLaptopViewport
      backHref="/dashboard/productos"
      backLabel={t("cartaImport.shellBack")}
    >
      <MenuPhotoImportFlow />
    </ModulePageShell>
  );
}
