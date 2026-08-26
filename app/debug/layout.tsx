import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function DebugLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return children;
}
