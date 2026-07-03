import { marketingBenefits } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function BenefitsSection() {
  return (
    <section id="beneficios" className="marketing-section scroll-mt-24 bg-white">
      <MarketingContainer>
        <SectionHeading
          eyebrow="Beneficios"
          title="Menos clics. Más control. Operación más rápida."
          description="Hostly convierte el trabajo diario del restaurante en flujos claros para gerencia, sala, barra y cocina."
          align="center"
          className="mx-auto"
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {marketingBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-surface-page-soft)] p-5">
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-white text-[color:var(--hostly-accent)] shadow-[var(--hostly-shadow-hairline)]">
                  <Icon className="size-4" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.02em]">{benefit.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{benefit.description}</p>
              </article>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
