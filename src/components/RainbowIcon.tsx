import { LucideIcon } from "lucide-react";
import React from "react";

const baseRainbow = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#4338ca",
  "#9333ea",
];

interface RainbowIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  // smooth = gradient blend, striped = hard bands
  mode?: "smooth" | "striped";
  maxColors?: number; // e.g., 5 to reduce bands
  direction?: "horizontal" | "vertical";
}

export default function RainbowIcon({
  icon: Icon,
  size = 14,
  className = "",
  mode = "smooth",
  maxColors,
  direction = "horizontal",
}: RainbowIconProps) {
  const id = React.useId();

  const colors =
    typeof maxColors === "number" && maxColors > 0
      ? baseRainbow.slice(0, Math.min(maxColors, baseRainbow.length))
      : baseRainbow;

  const gradientId = `grad-${id}`;
  const maskId = `mask-${id}`;

  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2={direction === "horizontal" ? "100%" : "0%"}
          y2={direction === "horizontal" ? "0%" : "100%"}
        >
          {mode === "striped"
            ? // hard stops for stripes
              colors.flatMap((c, i) => {
                const start = (i / colors.length) * 100;
                const end = ((i + 1) / colors.length) * 100;
                return [
                  <stop key={`${i}-a`} offset={`${start}%`} stopColor={c} />,
                  <stop key={`${i}-b`} offset={`${end}%`} stopColor={c} />,
                ];
              })
            : // smooth gradient
              colors.map((c, i) => (
                <stop
                  key={i}
                  offset={`${(i / (colors.length - 1)) * 100}%`}
                  stopColor={c}
                />
              ))}
        </linearGradient>

        <mask id={maskId} maskUnits="userSpaceOnUse">
          {/* Lucide icons are 24x24; scale to fit */}
          <g transform={`scale(${size / 24})`}>
            <Icon
              size={24}
              color="#fff"
              stroke="#fff"
              fill="none"
              strokeWidth={2}
            />
          </g>
        </mask>
      </defs>

      <rect
        x="0"
        y="0"
        width={size}
        height={size}
        fill={`url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
