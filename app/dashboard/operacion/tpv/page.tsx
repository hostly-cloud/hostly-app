"use client";

import { CartaPageContent } from "@/app/dashboard/carta/carta-page-content";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionTpvPage() {
  return (
    <OperacionModuleShell title="TPV">
      <CartaPageContent embeddedInOperacion />
    </OperacionModuleShell>
  );
}
