"use client";

import CocktailView from "@/components/kds/cocktail-view";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

export default function OperacionCocteleriaPage() {
  return (
    <OperacionModuleShell title="Coctelería" showFilterBar>
      <CocktailView />
    </OperacionModuleShell>
  );
}
