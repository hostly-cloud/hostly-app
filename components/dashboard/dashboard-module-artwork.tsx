import type { SVGProps } from "react";

export type DashboardArtworkKind =
  | "tpv"
  | "kitchen"
  | "bar"
  | "cocktail"
  | "reservations"
  | "products"
  | "settings"
  | "analytics";

type ArtworkProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  kind: DashboardArtworkKind;
};

export function DashboardModuleArtwork({
  kind,
  className,
  ...props
}: ArtworkProps) {
  const shared = {
    className: ["hostly-dashboard-artwork-svg", className]
      .filter(Boolean)
      .join(" "),
    viewBox: "0 0 240 180",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
    ...props,
  } as const;

  if (kind === "tpv") {
    return (
      <svg {...shared}>
        <rect
          className="hostly-dashboard-artwork__halo"
          x="21"
          y="18"
          width="198"
          height="144"
          rx="34"
        />
        <rect
          className="hostly-dashboard-artwork__surface"
          x="40"
          y="35"
          width="150"
          height="106"
          rx="20"
        />
        <rect
          className="hostly-dashboard-artwork__screen"
          x="54"
          y="50"
          width="122"
          height="72"
          rx="13"
        />
        <rect
          className="hostly-dashboard-artwork__accent"
          x="66"
          y="62"
          width="40"
          height="20"
          rx="8"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="114"
          y="62"
          width="49"
          height="7"
          rx="3.5"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="114"
          y="76"
          width="36"
          height="7"
          rx="3.5"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="66"
          y="94"
          width="31"
          height="16"
          rx="6"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="103"
          y="94"
          width="31"
          height="16"
          rx="6"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="140"
          y="94"
          width="23"
          height="16"
          rx="6"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M69 141v14m92-14v14M55 156h120"
        />
        <g transform="translate(165 91) rotate(8)">
          <rect
            className="hostly-dashboard-artwork__device"
            width="50"
            height="66"
            rx="13"
          />
          <rect
            className="hostly-dashboard-artwork__screen"
            x="8"
            y="10"
            width="34"
            height="26"
            rx="7"
          />
          <circle
            className="hostly-dashboard-artwork__accent"
            cx="25"
            cy="50"
            r="7"
          />
        </g>
      </svg>
    );
  }

  if (kind === "kitchen") {
    return (
      <svg {...shared}>
        <circle
          className="hostly-dashboard-artwork__halo"
          cx="120"
          cy="92"
          r="72"
        />
        <path
          className="hostly-dashboard-artwork__surface"
          d="M50 122h140a16 16 0 0 1-16 16H66a16 16 0 0 1-16-16Z"
        />
        <path
          className="hostly-dashboard-artwork__surface"
          d="M67 118a53 53 0 0 1 106 0H67Z"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M120 54V41m-13 2c-8-8-5-18 1-24m25 24c8-8 5-18-1-24"
        />
        <circle
          className="hostly-dashboard-artwork__accent"
          cx="120"
          cy="57"
          r="8"
        />
        <path
          className="hostly-dashboard-artwork__line"
          d="M87 103c14-19 52-25 68-4-24-5-45-2-68 4Z"
        />
      </svg>
    );
  }

  if (kind === "bar") {
    return (
      <svg {...shared}>
        <rect
          className="hostly-dashboard-artwork__halo"
          x="28"
          y="30"
          width="184"
          height="126"
          rx="34"
        />
        <path
          className="hostly-dashboard-artwork__surface"
          d="M48 96h144v44H48z"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M42 96h156M64 140v16m112-16v16M57 156h126"
        />
        <path
          className="hostly-dashboard-artwork__device"
          d="M72 47h25l-3 49H75l-3-49Z"
        />
        <path
          className="hostly-dashboard-artwork__accent"
          d="M111 37h28l-4 59h-20l-4-59Z"
        />
        <path
          className="hostly-dashboard-artwork__device"
          d="M154 57h19l-2 39h-15l-2-39Z"
        />
        <path
          className="hostly-dashboard-artwork__line"
          d="M74 67h21m18-10h24m18 17h17"
        />
        <rect
          className="hostly-dashboard-artwork__screen"
          x="61"
          y="108"
          width="48"
          height="17"
          rx="7"
        />
        <rect
          className="hostly-dashboard-artwork__screen"
          x="120"
          y="108"
          width="59"
          height="17"
          rx="7"
        />
      </svg>
    );
  }

  if (kind === "cocktail") {
    return (
      <svg {...shared}>
        <circle
          className="hostly-dashboard-artwork__halo"
          cx="119"
          cy="90"
          r="73"
        />
        <path
          className="hostly-dashboard-artwork__surface"
          d="M46 44h78L85 91 46 44Z"
        />
        <path
          className="hostly-dashboard-artwork__accent"
          d="M131 56h52l-9 75h-34l-9-75Z"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M85 91v43m-24 0h48M143 82h36m-19-49 8 22m19-29-12 30"
        />
        <path
          className="hostly-dashboard-artwork__line"
          d="M59 58h51L85 82 59 58Z"
        />
        <circle
          className="hostly-dashboard-artwork__device"
          cx="61"
          cy="49"
          r="10"
        />
        <circle
          className="hostly-dashboard-artwork__device"
          cx="101"
          cy="47"
          r="8"
        />
      </svg>
    );
  }

  if (kind === "reservations") {
    return (
      <svg {...shared}>
        <rect
          className="hostly-dashboard-artwork__halo"
          x="27"
          y="24"
          width="186"
          height="132"
          rx="36"
        />
        <rect
          className="hostly-dashboard-artwork__surface"
          x="48"
          y="42"
          width="121"
          height="104"
          rx="20"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M48 70h121M77 35v18m64-18v18"
        />
        <rect
          className="hostly-dashboard-artwork__screen"
          x="65"
          y="84"
          width="24"
          height="20"
          rx="6"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="97"
          y="84"
          width="24"
          height="20"
          rx="6"
        />
        <rect
          className="hostly-dashboard-artwork__line"
          x="65"
          y="112"
          width="24"
          height="19"
          rx="6"
        />
        <path
          className="hostly-dashboard-artwork__accent"
          d="m101 119 8 8 17-20"
        />
        <circle
          className="hostly-dashboard-artwork__device"
          cx="178"
          cy="111"
          r="30"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M163 112h30m-15-15v30"
        />
      </svg>
    );
  }

  if (kind === "products") {
    return (
      <svg {...shared}>
        <path
          className="hostly-dashboard-artwork__halo"
          d="m43 67 77-41 77 41v74l-77 39-77-39V67Z"
        />
        <path
          className="hostly-dashboard-artwork__surface"
          d="m54 69 66-35 66 35-66 34-66-34Z"
        />
        <path
          className="hostly-dashboard-artwork__stroke"
          d="M54 69v65l66 35 66-35V69m-66 34v66"
        />
        <path
          className="hostly-dashboard-artwork__accent"
          d="m88 51 66 35v28l-18-9-16 8-16-8-16 9V51Z"
        />
      </svg>
    );
  }

  if (kind === "settings") {
    return (
      <svg {...shared}>
        <rect
          className="hostly-dashboard-artwork__halo"
          x="30"
          y="26"
          width="180"
          height="128"
          rx="36"
        />
        <rect
          className="hostly-dashboard-artwork__surface"
          x="54"
          y="52"
          width="132"
          height="20"
          rx="10"
        />
        <rect
          className="hostly-dashboard-artwork__surface"
          x="54"
          y="82"
          width="132"
          height="20"
          rx="10"
        />
        <rect
          className="hostly-dashboard-artwork__surface"
          x="54"
          y="112"
          width="132"
          height="20"
          rx="10"
        />
        <circle
          className="hostly-dashboard-artwork__accent"
          cx="89"
          cy="62"
          r="15"
        />
        <circle
          className="hostly-dashboard-artwork__device"
          cx="149"
          cy="92"
          r="15"
        />
        <circle
          className="hostly-dashboard-artwork__accent"
          cx="110"
          cy="122"
          r="15"
        />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <rect
        className="hostly-dashboard-artwork__halo"
        x="30"
        y="25"
        width="180"
        height="130"
        rx="36"
      />
      <path
        className="hostly-dashboard-artwork__stroke"
        d="M54 137V56m0 81h137"
      />
      <rect
        className="hostly-dashboard-artwork__surface"
        x="72"
        y="100"
        width="24"
        height="37"
        rx="8"
      />
      <rect
        className="hostly-dashboard-artwork__device"
        x="108"
        y="75"
        width="24"
        height="62"
        rx="8"
      />
      <rect
        className="hostly-dashboard-artwork__accent"
        x="144"
        y="48"
        width="24"
        height="89"
        rx="8"
      />
      <path
        className="hostly-dashboard-artwork__line"
        d="m68 83 38-23 27 9 48-32"
      />
      <circle
        className="hostly-dashboard-artwork__accent"
        cx="181"
        cy="37"
        r="8"
      />
    </svg>
  );
}
