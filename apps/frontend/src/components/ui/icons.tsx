import type { ReactNode, SVGProps } from "react";

/** Small stroke icons for status. Always decorative: pair with a visible word. */
function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
      {...props}
    >
      {children}
    </svg>
  );
}
type P = SVGProps<SVGSVGElement>;

export const IconCheckCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Svg>
);
export const IconQuestion = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8" />
    <path d="M12 17v.01" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4 3 20h18L12 4Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.01" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8v.01" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 6v12M15 6v12" />
  </Svg>
);
export const IconXCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Svg>
);
export const IconCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
  </Svg>
);
export const IconHalfCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
  </Svg>
);
export const IconSkip = (p: P) => (
  <Svg {...p}>
    <path d="m6 5 8 7-8 7V5Z" />
    <path d="M18 5v14" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V4h11l-2 4 2 4H6" />
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M5 17a3 3 0 0 1 3-3h10" />
  </Svg>
);
export const IconDoc = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h7l4 4v14H7V3Z" />
    <path d="M14 3v4h4M9.5 13h5M9.5 17h5" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V5M7 9l5-5 5 5" />
    <path d="M5 19h14" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7 11l5 5 5-5" />
    <path d="M5 19h14" />
  </Svg>
);
export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1Z" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Svg>
);
export const IconWifiOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M12 20v.01" />
  </Svg>
);
export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" />
  </Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
