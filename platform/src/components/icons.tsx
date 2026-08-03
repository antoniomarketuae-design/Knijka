import type { SVGProps } from "react";

/**
 * Inline stroke icon set (no external deps, no CDNs).
 * All icons are decorative by default (aria-hidden) — pair them with
 * visible text or add your own aria-label at the call site.
 */

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h14" />
      <path d="M9 7h6" />
    </svg>
  );
}

/**
 * The classroom: a board on the wall with a figure standing in front of it.
 *
 * Deliberately NOT a second book. „Теория" already owns the book, and the
 * whole point of this destination is that it is not a reader — it is a room
 * with someone in it. The nav row is the first and often the only description
 * of a feature a student ever reads.
 */
export function IconChalkboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="12" rx="1.5" />
      <path d="M7 7h7" />
      <path d="M7 10.5h4" />
      <circle cx="8.5" cy="17.5" r="1.6" />
      <path d="M6 22v-1.2a2.5 2.5 0 0 1 5 0V22" />
    </svg>
  );
}

export function IconClipboardCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2.5h6V4" />
      <path d="m8.5 13 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconWheel(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3.5 10.5c2.5-1 5.5-1.5 8.5-1.5s6 .5 8.5 1.5" />
      <path d="M12 15v6" />
      <path d="m9.5 14-4.5 4" />
      <path d="m14.5 14 4.5 4" />
    </svg>
  );
}

export function IconBot(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M9 13v1.5" />
      <path d="M15 13v1.5" />
      <path d="M9.5 17.5h5" />
    </svg>
  );
}

export function IconTrophy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4.5a3.5 3.5 0 0 0 3.6 3.5" />
      <path d="M16 5h3.5a3.5 3.5 0 0 1-3.6 3.5" />
      <path d="M12 14v3" />
      <path d="M8.5 21h7" />
      <path d="M10 17h4v4h-4z" />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

export function IconFlame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21c3.9 0 6.5-2.5 6.5-6.2 0-2.6-1.4-4.6-2.8-6.3-.6 1-1.2 1.6-2 2.1.2-2.9-1-5.5-3.7-7.6.2 2.7-.8 4.3-2.3 5.9-1.4 1.5-2.2 3.4-2.2 5.9C5.5 18.5 8.1 21 12 21Z" />
      <path d="M12 21c1.8 0 3-1.3 3-3.1 0-1.5-.9-2.6-1.9-3.6-.9 1-2 1.7-2.9 2.8-.4.5-.7 1.1-.7 1.9 0 1.1 1 2 2.5 2Z" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
    </svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function IconMedal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="14" r="5" />
      <path d="m12 12.2.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3.9-1.8Z" />
      <path d="M8.5 9.5 6 3h4l2 4.5L14 3h4l-2.5 6.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="m16 8 4 4-4 4" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 5 14 14" />
      <path d="M19 5 5 19" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h16" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8 7.5 10 4.4-2 7.5-5.4 7.5-10v-6L12 2.5Z" />
      <path d="m8.8 11.8 2.4 2.4 4-4.6" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3Z" />
    </svg>
  );
}
