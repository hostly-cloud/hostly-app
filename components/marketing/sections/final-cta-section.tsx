import { ArrowRight } from "lucide-react";
import { marketingFinalCta } from "@/data/marketing/landing-content";
import { MarketingButton, MarketingContainer } from "@/components/marketing/ui/marketing-primitives";

export function FinalCtaSection() {
  return (
    <section className="marketing-section pb-24 pt-8">
      <MarketingContainer>
        <div className="relative overflow-hidden rounded-[24px] border border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-navy-deep)] px-6 py-12 text-white md:px-10 md:py-14">
          <div className="marketing-gradient-spot right-[-10%] top-[-20%] h-56 w-56 bg-[color:var(--hostly-ice-400)] opacity-30" />
          <div className="relative max-w-2xl">
            <h2 className="text-balance text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
              {marketingFinalCta.title}
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/78">{marketingFinalCta.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MarketingButton
                href={marketingFinalCta.primaryCta.href}
                className="border-white bg-white text-[color:var(--hostly-navy-deep)] hover:bg-[color:var(--hostly-ice-50)]"
              >
                {marketingFinalCta.primaryCta.label}
                <ArrowRight className="size-4" />
              </MarketingButton>
              <MarketingButton
                href={marketingFinalCta.secondaryCta.href}
                external
                variant="secondary"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                {marketingFinalCta.secondaryCta.label}
              </MarketingButton>
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
