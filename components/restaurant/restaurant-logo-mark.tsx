"use client";

type RestaurantLogoMarkProps = {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
};

export function RestaurantLogoMark({
  name,
  logoUrl,
  size = 40,
  className = "",
}: RestaurantLogoMarkProps) {
  const trimmedUrl = logoUrl?.trim();
  const initial = (name.trim()[0] ?? "M").toUpperCase();
  const dimension = { width: size, height: size };

  if (trimmedUrl) {
    return (
      <img
        src={trimmedUrl}
        alt=""
        className={[
          "shrink-0 rounded-full border border-[var(--hostly-table-divider-soft)] object-cover bg-white",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={dimension}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--hostly-table-divider-soft)] bg-[color-mix(in_srgb,var(--hostly-accent-soft)_72%,white)] text-[color:var(--hostly-navy-deep)] font-semibold",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...dimension,
        fontSize: Math.max(12, Math.round(size * 0.38)),
      }}
    >
      {initial}
    </span>
  );
}
