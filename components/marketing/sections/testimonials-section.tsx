import { marketingTestimonials } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function TestimonialsSection() {
  return (
    <section id="testimonios" className="marketing-section scroll-mt-24">
      <MarketingContainer>
        <SectionHeading
          eyebrow="Casos de uso"
          title="Diseñado para operaciones reales de hostelería."
          description="Hostly encaja en negocios donde la sala, la carta, las mesas y los espacios cambian durante el servicio."
          align="center"
          className="mx-auto"
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {marketingTestimonials.map((item) => (
            <figure key={item.name} className="marketing-card flex h-full flex-col p-6">
              <blockquote className="text-[15px] leading-[1.7] tracking-[-0.01em] text-[color:var(--hostly-ink-strong)]">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-6 border-t border-[color:var(--hostly-table-divider-soft)] pt-4">
                <div className="text-[14px] font-semibold">{item.name}</div>
                <div className="mt-1 text-[12px] text-[color:var(--hostly-ink-muted)]">
                  {item.role} · {item.venue}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
