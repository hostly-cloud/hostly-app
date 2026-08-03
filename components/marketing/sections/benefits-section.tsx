import { marketingKeyBenefits } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function BenefitsSection() {
  return (
    <section id="beneficios" className="marketing-section scroll-mt-24 border-y border-[color:var(--hostly-table-divider-soft)] bg-white">
      <MarketingContainer>
        <SectionHeading
          eyebrow="Beneficios clave"
          title="Más velocidad para el equipo. Más control para el restaurante."
          description="Hostly reduce pasos en las tareas que más se repiten durante el servicio: vender, enviar comandas, revisar mesas y cobrar."
          align="center"
          className="mx-auto"
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {marketingKeyBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title} className="marketing-card p-5">
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-white text-[color:var(--hostly-accent)] shadow-[var(--hostly-shadow-hairline)]">
                  <Icon className="size-4" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-normal">{benefit.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{benefit.description}</p>
              </article>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
