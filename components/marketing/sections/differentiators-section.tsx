import { marketingDifferentiators } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function DifferentiatorsSection() {
  return (
    <section id="diferenciadores" className="marketing-section scroll-mt-24">
      <MarketingContainer>
        <SectionHeading
          eyebrow={marketingDifferentiators.eyebrow}
          title={marketingDifferentiators.title}
          description={marketingDifferentiators.description}
          align="center"
          className="mx-auto"
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {marketingDifferentiators.items.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[18px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-5 shadow-[var(--hostly-shadow-hairline)]">
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]">
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold tracking-normal">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{item.description}</p>
              </article>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
