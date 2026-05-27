import { marketingFeatures, marketingSolutionIntro } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function SolutionSection() {
  return (
    <section id="solucion" className="marketing-section scroll-mt-24">
      <MarketingContainer>
        <SectionHeading
          eyebrow={marketingSolutionIntro.eyebrow}
          title={marketingSolutionIntro.title}
          description={marketingSolutionIntro.description}
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {marketingFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="marketing-card group p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)] transition-colors group-hover:bg-[color:var(--hostly-navy-deep)] group-hover:text-white">
                    <Icon className="size-[18px]" strokeWidth={1.75} />
                  </div>
                  <span className="rounded-full border border-[color:var(--hostly-table-divider-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">
                    {feature.detail}
                  </span>
                </div>
                <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em]">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
