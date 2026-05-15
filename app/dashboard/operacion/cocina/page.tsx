"use client";

import KitchenView from "@/components/kds/kitchen-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionCocinaPage() {
  return (
    <OperacionModuleShell title="Cocina" showFilterBar={false}>
      <KitchenView />
    </OperacionModuleShell>
  );
}
