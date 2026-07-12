import { marketingProblems } from "@/data/marketing/landing-content";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function ProblemsSection() {
  return (
    <section className="marketing-section border-y border-[color:var(--hostly-table-divider-soft)] bg-white">
      <MarketingContainer>
        <SectionHeading
          eyebrow="El problema"
          title="La hostelería moderna necesita una operación más visual."
          description="Cuando la sala, la carta y el TPV no están conectados, el equipo pierde velocidad y contexto en pleno servicio."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {marketingProblems.map((problem) => {
            const Icon = problem.icon;
            return (
              <article key={problem.title} className="marketing-card p-5">
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-accent)]">
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-normal">{problem.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{problem.description}</p>
              </article>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
