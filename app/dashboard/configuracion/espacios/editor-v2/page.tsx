"use client";

import Link from "next/link";
import { SalaEditorWorkspace } from "@/components/sala-editor/sala-editor-workspace";
import { ConfigModulePageHeader } from "../../_components/config-module-page-header";

const PREVIEW_RESTAURANT_ID = "preview-local";

export default function EditorSalaV2PreviewPage() {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <ConfigModulePageHeader
        secondaryActions={
          <Link
            href="/dashboard/configuracion/espacios/mesas"
            className="inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Editor actual
          </Link>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <SalaEditorWorkspace restaurantId={PREVIEW_RESTAURANT_ID} />
      </div>
    </div>
  );
}
