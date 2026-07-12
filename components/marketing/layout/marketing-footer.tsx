import Link from "next/link";
import { marketingFooter } from "@/data/marketing/landing-content";
import { HostlyBrandLockup } from "@/components/brand/hostly-brand";

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hostly-ink-faint)]">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.href.startsWith("mailto:") || link.href === "#" ? (
              <a href={link.href} className="text-[13px] text-[color:var(--hostly-ink-muted)] transition-colors hover:text-[color:var(--hostly-ink-strong)]">
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="text-[13px] text-[color:var(--hostly-ink-muted)] transition-colors hover:text-[color:var(--hostly-ink-strong)]">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[color:var(--hostly-table-divider-soft)] bg-white">
      <div className="marketing-container py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div>
            <HostlyBrandLockup
              size={32}
              tone="app"
              className="inline-flex items-center gap-2.5"
            />
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[color:var(--hostly-ink-muted)]">
              TPV SaaS para restaurantes, bares y negocios de hostelería que quieren operar sala, cocina y caja con más claridad.
            </p>
            <a
              href={`mailto:${marketingFooter.contactEmail}`}
              className="mt-4 inline-block text-[13px] font-medium text-[color:var(--hostly-accent)] hover:underline"
            >
              {marketingFooter.contactEmail}
            </a>
          </div>
          <FooterColumn title="Producto" links={marketingFooter.product} />
          <FooterColumn title="Empresa" links={marketingFooter.company} />
          <FooterColumn title="Legal" links={marketingFooter.legal} />
        </div>
        <div className="mt-12 border-t border-[color:var(--hostly-table-divider-soft)] pt-6 text-[12px] text-[color:var(--hostly-ink-faint)]">
          {marketingFooter.copyright}
        </div>
      </div>
    </footer>
  );
}
