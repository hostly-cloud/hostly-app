import { marketingProductShowcase } from "@/data/marketing/landing-content";
import { ProductShowcaseMockups } from "@/components/marketing/mockups/product-mockups";
import { MarketingContainer, SectionHeading } from "@/components/marketing/ui/marketing-primitives";

export function ProductShowcaseSection() {
  return (
    <section id="producto" className="marketing-section scroll-mt-24 marketing-grid-bg">
      <MarketingContainer>
        <SectionHeading
          eyebrow={marketingProductShowcase.eyebrow}
          title={marketingProductShowcase.title}
          description={marketingProductShowcase.description}
          align="center"
          className="mx-auto"
        />
        <div className="mt-12">
          <ProductShowcaseMockups />
        </div>
      </MarketingContainer>
    </section>
  );
}
