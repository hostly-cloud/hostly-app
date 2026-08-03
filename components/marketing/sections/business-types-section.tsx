import { marketingBusinessTypes } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function BusinessTypesSection() {
  return (
    <section id="negocios" className="marketing-section scroll-mt-24 bg-white">
      <MarketingContainer>
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <SectionHeading
            eyebrow={marketingBusinessTypes.eyebrow}
            title={marketingBusinessTypes.title}
            description={marketingBusinessTypes.description}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {marketingBusinessTypes.items.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="marketing-card p-5">
                  <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-accent)]">
                    <Icon className="size-[18px]" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold tracking-normal">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
