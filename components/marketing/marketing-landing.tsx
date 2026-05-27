import { MarketingFooter } from "@/components/marketing/layout/marketing-footer";
import { MarketingHeader } from "@/components/marketing/layout/marketing-header";
import { AiSection } from "@/components/marketing/sections/ai-section";
import { BenefitsSection } from "@/components/marketing/sections/benefits-section";
import { FinalCtaSection } from "@/components/marketing/sections/final-cta-section";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { ProblemsSection } from "@/components/marketing/sections/problems-section";
import { ProductShowcaseSection } from "@/components/marketing/sections/product-showcase-section";
import { SolutionSection } from "@/components/marketing/sections/solution-section";
import { TestimonialsSection } from "@/components/marketing/sections/testimonials-section";

export function MarketingLanding() {
  return (
    <div className="marketing-site">
      <MarketingHeader />
      <main>
        <HeroSection />
        <ProblemsSection />
        <SolutionSection />
        <AiSection />
        <ProductShowcaseSection />
        <BenefitsSection />
        <TestimonialsSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
