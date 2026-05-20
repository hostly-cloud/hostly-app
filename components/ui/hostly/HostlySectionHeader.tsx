import type { ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlySectionHeaderProps = {
  title: ReactNode;
  /** Shown under the title when string/number; pass a custom node via `description` as JSX for full control. */
  description?: ReactNode;
  /** Typographic treatment for plain text titles. @default "heading" */
  titleVariant?: "heading" | "section";
  className?: string;
  descriptionClassName?: string;
  /** Trailing actions (filters, buttons). */
  children?: ReactNode;
};

function renderPlainTitle(title: ReactNode, variant: "heading" | "section"): ReactNode {
  if (title == null) return null;
  if (typeof title === "string" || typeof title === "number") {
    const cls = variant === "section" ? "hostly-section-label" : "hostly-heading";
    return <h2 className={cls}>{title}</h2>;
  }
  return title;
}

export function HostlySectionHeader({
  title,
  description,
  titleVariant = "heading",
  className,
  descriptionClassName,
  children,
}: HostlySectionHeaderProps) {
  const desc =
    description == null ? null : typeof description === "string" || typeof description === "number" ? (
      <p className={hostlyCx("hostly-muted hostly-muted--section-lead", descriptionClassName)}>{description}</p>
    ) : (
      description
    );

  return (
    <header
      className={hostlyCx("flex flex-wrap items-start justify-between gap-[var(--hostly-section-header-gap)]", className)}
    >
      <div className="hostly-section-header__stack min-w-0 flex-1">
        {renderPlainTitle(title, titleVariant)}
        {desc}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-[var(--hostly-stack-gap-sm)]">{children}</div> : null}
    </header>
  );
}
