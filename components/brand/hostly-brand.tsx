import type { CSSProperties } from "react";
import Image from "next/image";

export type HostlyBrandMarkTone = "app" | "premium" | "mono";
export const HOSTLY_LOGO_SRC = "/brand/hostly-logo.png";
export const HOSTLY_MARK_SRC = "/brand/hostly-mark.png";

type HostlyBrandMarkProps = {
  size?: number;
  tone?: HostlyBrandMarkTone;
  className?: string;
  style?: CSSProperties;
};

type HostlyBrandLockupProps = HostlyBrandMarkProps & {
  showWordmark?: boolean;
  /** Compatibilidad con consumidores antiguos; el asset oficial ya incluye wordmark. */
  wordmarkClassName?: string;
};

export function HostlyBrandMark({
  size = 40,
  className,
  style,
}: HostlyBrandMarkProps) {
  return (
    <Image
      src={HOSTLY_MARK_SRC}
      alt="Hostly"
      width={size}
      height={size}
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        flexShrink: 0,
        objectFit: "contain",
        ...style,
      }}
    />
  );
}

export function HostlyBrandLockup({
  size = 40,
  tone = "app",
  className,
  style,
  showWordmark = true,
}: HostlyBrandLockupProps) {
  if (!showWordmark) {
    return <HostlyBrandMark size={size} tone={tone} className={className} style={style} />;
  }

  const width = Math.round(size * 4.25);

  return (
    <Image
      src={HOSTLY_LOGO_SRC}
      alt="Hostly"
      width={width}
      height={size}
      className={className}
      style={{
        display: "block",
        width,
        height: size,
        maxWidth: "100%",
        flexShrink: 0,
        objectFit: "contain",
        objectPosition: "center",
        ...style,
      }}
    />
  );
}
