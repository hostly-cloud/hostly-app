"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { marketingNav } from "@/data/marketing/landing-content";
import { MarketingButton } from "@/components/marketing/ui/marketing-primitives";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${
        scrolled
          ? "border-[color:var(--hostly-table-divider-soft)] bg-white/88 backdrop-blur-md"
          : "border-transparent bg-[color:var(--hostly-surface-page-soft)]/80 backdrop-blur-sm"
      }`}
    >
      <div className="marketing-container flex h-[68px] items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-[color:var(--hostly-navy-deep)] text-[13px] font-bold tracking-tight text-white">
            H
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.03em] text-[color:var(--hostly-ink-strong)]">Hostly</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {marketingNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-[color:var(--hostly-ink-muted)] transition-colors hover:text-[color:var(--hostly-ink-strong)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <MarketingButton href="/login" variant="ghost" className="min-h-[40px] px-4 py-2">
            Iniciar sesión
          </MarketingButton>
          <MarketingButton href="/login" variant="primary" className="min-h-[40px] px-4 py-2">
            Empezar
          </MarketingButton>
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-[color:var(--hostly-line-strong)] bg-white md:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[color:var(--hostly-table-divider-soft)] bg-white md:hidden">
          <div className="marketing-container flex flex-col gap-1 py-4">
            {marketingNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-3 text-[14px] font-medium text-[color:var(--hostly-ink-strong)] hover:bg-[color:var(--hostly-ice-50)]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 grid gap-2">
              <MarketingButton href="/login" variant="secondary" className="w-full">
                Iniciar sesión
              </MarketingButton>
              <MarketingButton href="/login" variant="primary" className="w-full">
                Empezar
              </MarketingButton>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
