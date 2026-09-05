import type { ReactNode } from "react";
import { CashCloseOperationsPanel } from "@/components/cash/cash-close-operations-panel";

export default function CajaLayout({ children }: { children: ReactNode }) {
  return <>{children}<CashCloseOperationsPanel /></>;
}
