"use client";

import BarView from "@/components/kds/bar-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionBarraPage() {
  return (
    <OperacionModuleShell title="Barra" showFilterBar>
      <BarView />
    </OperacionModuleShell>
  );
}
