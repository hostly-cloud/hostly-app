import { marketingAi } from "@/data/marketing/landing-content";
import { AiVisualMockup } from "@/components/marketing/mockups/product-mockups";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function AiSection() {
  return (
    <section id="ia" className="marketing-section scroll-mt-24 border-y border-[color:var(--hostly-table-divider-soft)] bg-white">
      <MarketingContainer>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div>
            <SectionHeading
              eyebrow={marketingAi.eyebrow}
              title={marketingAi.title}
              description={marketingAi.description}
            />

            <div className="mt-10 space-y-3">
              {marketingAi.features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="flex gap-3 rounded-[14px] border border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-surface-page-soft)] p-4 transition-colors hover:border-[color:var(--hostly-accent)]/20 hover:bg-white"
                  >
                    <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--hostly-accent)] shadow-[var(--hostly-shadow-hairline)]">
                      <Icon className="size-[18px]" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-semibold tracking-normal">{feature.title}</h3>
                        {feature.badge ? (
                          <span className="rounded-full bg-[color:var(--hostly-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-navy-deep)]">
                            {feature.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{feature.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <AiVisualMockup />
        </div>
      </MarketingContainer>
    </section>
  );
}
