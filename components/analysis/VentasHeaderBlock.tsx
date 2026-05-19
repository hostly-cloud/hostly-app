import { HostlySectionHeader } from "@/components/ui/hostly";

export type VentasHeaderBlockProps = {
  title?: string;
  subtitle?: string;
};

export function VentasHeaderBlock({ title = "Ventas", subtitle }: VentasHeaderBlockProps) {
  return <HostlySectionHeader title={title} description={subtitle} />;
}
