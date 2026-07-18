/** Cursor-style monochrome stroke icons (16×16, currentColor) */

import type { ReactNode } from "react";

type P = { size?: number; className?: string };

const defaults = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({
  size = 16,
  className,
  children,
}: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
      {...defaults}
    >
      {children}
    </svg>
  );
}

export function IconPaperPlane({ size = 16, className }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

export function IconFolder({ size = 16, className }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function IconFolderOpen({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M1.5 4.2c0-.66.54-1.2 1.2-1.2h3.15l1.15 1.25h5.3c.66 0 1.2.54 1.2 1.2V6" />
      <path d="M1.65 6.35h12.7l-1.4 6.05c-.12.5-.56.85-1.08.85H4.13c-.52 0-.96-.35-1.08-.85L1.65 6.35z" />
    </Svg>
  );
}

export function IconTerminal({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4 6.5l2 2-2 2M8 10.5h4" />
    </Svg>
  );
}

export function IconRefresh({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M13.5 8A5.5 5.5 0 1 1 11 3.2" />
      <path d="M13.5 2.5v3.5H10" />
    </Svg>
  );
}

export function IconSidebar({ size, className }: P) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 18 14"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="1.5" width="15" height="11" rx="2" />
      <path d="M6.5 1.5v11" />
    </svg>
  );
}

export function IconArrowUp({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Svg>
  );
}

export function IconStop({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <rect
        x="4"
        y="4"
        width="8"
        height="8"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

export function IconCustomize({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1" />
    </Svg>
  );
}

export function IconSearch({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  );
}

export function IconCheck({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </Svg>
  );
}

export function IconList({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 4h9M5 8h9M5 12h9" />
      <circle cx="2.5" cy="4" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPencil({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M9.5 3.5l3 3L5 14H2v-3L9.5 3.5z" />
      <path d="M8 5l3 3" />
    </Svg>
  );
}

export function IconSpark({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <path d="M8 2.5l1.2 3.8L13 7.5l-3.8 1.2L8 12.5 6.8 8.7 3 7.5l3.8-1.2L8 2.5z" />
    </Svg>
  );
}

export function IconLayers({ size, className }: P) {
  return (
    <Svg size={size} className={className}>
      <circle cx="6.2" cy="8" r="3.4" />
      <circle cx="9.8" cy="8" r="3.4" />
    </Svg>
  );
}
