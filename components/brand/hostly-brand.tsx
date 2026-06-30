import type { CSSProperties } from "react";

export type HostlyBrandMarkTone = "app" | "premium" | "mono";

type HostlyBrandMarkProps = {
  size?: number;
  tone?: HostlyBrandMarkTone;
  className?: string;
  style?: CSSProperties;
};

type HostlyBrandLockupProps = HostlyBrandMarkProps & {
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

export function HostlyBrandMark({
  size = 40,
  tone = "app",
  className,
  style,
}: HostlyBrandMarkProps) {
  const gradientId = `hostly-brand-${tone}`;
  const isMono = tone === "mono";
  const start = tone === "premium" ? "#55A8D5" : "#3D8AB8";
  const end = "#0F2744";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      style={style}
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="17"
        fill={isMono ? "currentColor" : `url(#${gradientId})`}
      />
      <path
        d="M18.5 18.5h8v20h20v-20h8v26.5c0 5.8-4.7 10.5-10.5 10.5h-5.5v-9h-12v9h-8V18.5Z"
        fill={isMono ? "var(--hostly-surface-card-solid, #fff)" : "#fff"}
      />
      <path
        d="M26.5 47h12"
        stroke={isMono ? "var(--hostly-surface-card-solid, #fff)" : "#DDF3FF"}
        strokeWidth="5.5"
        strokeLinecap="round"
        opacity="0.72"
      />
      {!isMono ? (
        <defs>
          <linearGradient id={gradientId} x1="10" y1="7" x2="57" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor={start} />
            <stop offset="1" stopColor={end} />
          </linearGradient>
        </defs>
      ) : null}
    </svg>
  );
}

export function HostlyWordmark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={className} style={style}>
      Hostly
    </span>
  );
}

export function HostlyBrandLockup({
  size = 40,
  tone = "app",
  className,
  style,
  showWordmark = true,
  wordmarkClassName,
}: HostlyBrandLockupProps) {
  return (
    <span className={className} style={style}>
      <HostlyBrandMark size={size} tone={tone} />
      {showWordmark ? <HostlyWordmark className={wordmarkClassName} /> : null}
    </span>
  );
}
