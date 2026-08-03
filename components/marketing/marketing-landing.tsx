import { MarketingFooter } from "@/components/marketing/layout/marketing-footer";
import { MarketingHeader } from "@/components/marketing/layout/marketing-header";
import { AiSection } from "@/components/marketing/sections/ai-section";
import { BenefitsSection } from "@/components/marketing/sections/benefits-section";
import { BusinessTypesSection } from "@/components/marketing/sections/business-types-section";
import { DifferentiatorsSection } from "@/components/marketing/sections/differentiators-section";
import { FinalCtaSection } from "@/components/marketing/sections/final-cta-section";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { OperationalFlowSection } from "@/components/marketing/sections/operational-flow-section";
import { ProductShowcaseSection } from "@/components/marketing/sections/product-showcase-section";
import { SolutionSection } from "@/components/marketing/sections/solution-section";

export function MarketingLanding() {
  return (
    <div className="marketing-site">
      <MarketingHeader />
      <main>
        <HeroSection />
        <BenefitsSection />
        <SolutionSection />
        <OperationalFlowSection />
        <AiSection />
        <BusinessTypesSection />
        <DifferentiatorsSection />
        <ProductShowcaseSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
