import SensitiveModuleGate from "@/components/sensitive-module-gate";

export const dynamic = "force-dynamic";

export default function InventarioLayout({ children }: { children: React.ReactNode }) {
  return <SensitiveModuleGate>{children}</SensitiveModuleGate>;
}
