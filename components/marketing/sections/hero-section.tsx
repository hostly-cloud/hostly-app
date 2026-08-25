import { ArrowRight } from "lucide-react";
import { marketingHero } from "@/data/marketing/landing-content";
import { HeroProductMockup } from "@/components/marketing/mockups/product-mockups";
import { MarketingButton, MarketingContainer } from "@/components/marketing/ui/marketing-primitives";

export function HeroSection() {
  return (
    <section className="marketing-section marketing-hero relative overflow-hidden pt-10 md:pt-14">
      <MarketingContainer className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="max-w-2xl">
            <div className="marketing-rise inline-flex items-center gap-2 rounded-full border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-1.5 shadow-[var(--hostly-shadow-hairline)]">
              <span className="size-1.5 rounded-full bg-[color:var(--hostly-accent)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hostly-accent)]">
                {marketingHero.eyebrow}
              </span>
            </div>

            <h1 className="marketing-headline marketing-rise marketing-rise-delay-1 mt-5 text-balance">
              {marketingHero.headline}
            </h1>

            <p className="marketing-subhead marketing-rise marketing-rise-delay-2 mt-5">{marketingHero.subcopy}</p>

            <div className="marketing-rise marketing-rise-delay-3 mt-8 flex flex-wrap gap-3">
              <MarketingButton
                href={marketingHero.primaryCta.href}
                data-marketing-event="generate_lead"
                data-marketing-label={marketingHero.primaryCta.label}
                data-marketing-placement="hero"
                data-meta-event="LeadIntent"
              >
                {marketingHero.primaryCta.label}
                <ArrowRight className="size-4" />
              </MarketingButton>
              <MarketingButton
                href={marketingHero.secondaryCta.href}
                variant="secondary"
                data-marketing-event="view_product"
                data-marketing-label={marketingHero.secondaryCta.label}
                data-marketing-placement="hero"
              >
                {marketingHero.secondaryCta.label}
              </MarketingButton>
            </div>

            <div className="marketing-rise marketing-rise-delay-3 mt-7 flex flex-wrap gap-2">
              {marketingHero.proofPoints.map((point) => (
                <span
                  key={point}
                  className="rounded-full border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[color:var(--hostly-ink-muted)]"
                >
                  {point}
                </span>
              ))}
            </div>

            <p className="mt-5 text-[12px] font-medium text-[color:var(--hostly-ink-faint)]">{marketingHero.trustLine}</p>
          </div>

          <HeroProductMockup />
        </div>
      </MarketingContainer>
    </section>
  );
}
