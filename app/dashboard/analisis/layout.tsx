import type { ReactNode } from "react";
import "./route-polish.css";

export default function AnalisisLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hostly-analysis-route" lang="es-ES">
      {children}
    </div>
  );
}
