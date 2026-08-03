import { marketingFlow } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function OperationalFlowSection() {
  return (
    <section id="flujo" className="marketing-section scroll-mt-24 bg-[color:var(--hostly-navy-deep)] text-white">
      <MarketingContainer>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <SectionHeading
            eyebrow={marketingFlow.eyebrow}
            title={marketingFlow.title}
            description={marketingFlow.description}
            className="marketing-section-heading-on-dark"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {marketingFlow.steps.map((step) => (
              <article
                key={step.step}
                className="rounded-[18px] border border-white/10 bg-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{step.step}</div>
                <h3 className="mt-4 text-[17px] font-semibold tracking-normal text-white">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/68">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
