import { HostlySectionHeader } from "@/components/ui/hostly";

export type VentasHeaderBlockProps = {
  title?: string;
  subtitle?: string;
  className?: string;
};

export function VentasHeaderBlock({ title = "Ventas", subtitle, className }: VentasHeaderBlockProps) {
  return (
    <HostlySectionHeader
      title={title}
      description={subtitle}
      titleVariant="section"
      className={className ?? "hostly-section-header--operational"}
    />
  );
}
