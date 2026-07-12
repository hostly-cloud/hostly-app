import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type MarketingButtonVariant = "primary" | "secondary" | "ghost";

type MarketingButtonProps = {
  href: string;
  children: ReactNode;
  variant?: MarketingButtonVariant;
  className?: string;
  external?: boolean;
} & Omit<ComponentPropsWithoutRef<"a">, "href" | "children" | "className">;

const variantClasses: Record<MarketingButtonVariant, string> = {
  primary:
    "bg-[color:var(--hostly-navy-deep)] text-white border border-[color:var(--hostly-navy-deep)] hover:bg-[color:var(--hostly-navy-mid)]",
  secondary:
    "bg-white text-[color:var(--hostly-ink-strong)] border border-[color:var(--hostly-line-strong)] hover:border-[color:var(--hostly-accent)] hover:bg-[color:var(--hostly-ice-50)]",
  ghost:
    "bg-transparent text-[color:var(--hostly-ink-muted)] border border-transparent hover:text-[color:var(--hostly-ink-strong)] hover:bg-white/70",
};

export function MarketingButton({
  href,
  children,
  variant = "primary",
  className = "",
  external,
  ...rest
}: MarketingButtonProps) {
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-semibold tracking-normal transition-colors duration-200 min-h-[46px]",
    variantClasses[variant],
    className,
  ].join(" ");

  if (external || href.startsWith("mailto:")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  if (href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

export function MarketingContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`marketing-container ${className}`.trim()}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  const alignClass = align === "center" ? "text-center mx-auto items-center" : "text-left items-start";

  return (
    <div className={`flex max-w-3xl flex-col gap-3 ${alignClass} ${className}`.trim()}>
      {eyebrow ? <span className="marketing-eyebrow">{eyebrow}</span> : null}
      <h2 className="marketing-headline text-balance">{title}</h2>
      {description ? <p className="marketing-subhead">{description}</p> : null}
    </div>
  );
}
