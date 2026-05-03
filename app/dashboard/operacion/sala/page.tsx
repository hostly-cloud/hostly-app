"use client";

import SalaView from "@/components/kds/sala-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionSalaPage() {
  return (
    <OperacionModuleShell title="Sala" showFilterBar>
      <SalaView />
    </OperacionModuleShell>
  );
}
