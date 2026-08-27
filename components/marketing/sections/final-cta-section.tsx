import { ArrowRight } from "lucide-react";
import { MarketingLeadForm } from "@/components/marketing/lead-form";
import { marketingFinalCta } from "@/data/marketing/landing-content";
import { MarketingButton, MarketingContainer } from "@/components/marketing/ui/marketing-primitives";

export function FinalCtaSection() {
  return (
    <section id="demo" className="marketing-section scroll-mt-24 pb-24 pt-8">
      <MarketingContainer>
        <div className="relative overflow-hidden rounded-[24px] border border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-navy-deep)] px-6 py-12 text-white md:px-10 md:py-14">
          <div className="relative max-w-3xl">
            <h2 className="text-balance text-[2rem] font-semibold leading-[1.08] tracking-normal md:text-[2.5rem]">
              {marketingFinalCta.title}
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/78">{marketingFinalCta.description}</p>
            <MarketingLeadForm />
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
              <span className="text-xs text-white/55">¿Prefieres hablar directamente?</span>
              <MarketingButton
                href={marketingFinalCta.secondaryCta.href}
                external
                variant="secondary"
                className="min-h-10 border-white/20 bg-transparent px-4 py-2 text-white hover:bg-white/10 hover:text-white"
                data-marketing-event="contact_click"
                data-marketing-label={marketingFinalCta.secondaryCta.label}
                data-marketing-placement="final_cta"
                data-meta-event="ContactIntent"
              >
                {marketingFinalCta.secondaryCta.label}
                <ArrowRight className="size-4" />
              </MarketingButton>
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
