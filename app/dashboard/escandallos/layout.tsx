import { CapabilityModuleGate } from "@/components/sensitive-module-gate";

export const dynamic = "force-dynamic";

export default function EscandallosLayout({ children }: { children: React.ReactNode }) {
  return (
    <CapabilityModuleGate capability="inventory.view">{children}</CapabilityModuleGate>
  );
}
