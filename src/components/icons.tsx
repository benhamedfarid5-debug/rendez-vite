import React from 'react';

type P = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconTooth = ({ size = 22, ...p }: P) => (
  <Svg size={size} {...p}>
    <path d="M12 3c-2.2 0-3.2 1-4.6 1C5.9 4 4 5.4 4 8.2c0 2.4.9 3.6 1.4 5.6.3 1.3.4 2.7.8 4.1.3 1.2.8 2.1 1.7 2.1 1.2 0 1.3-1.4 1.6-3 .3-1.5.6-2.3 2.5-2.3s2.2.8 2.5 2.3c.3 1.6.4 3 1.6 3 .9 0 1.4-.9 1.7-2.1.4-1.4.5-2.8.8-4.1.5-2 1.4-3.2 1.4-5.6C20 5.4 18.1 4 16.6 4 15.2 4 14.2 3 12 3Z" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const IconPhone = (p: P) => (
  <Svg {...p}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2A2 2 0 0 1 5 4Z" /></Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></Svg>
);
export const IconQr = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 20h3" />
  </Svg>
);
export const IconCamera = (p: P) => (
  <Svg {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.4" /></Svg>
);
export const IconChevronLeft = (p: P) => <Svg {...p}><path d="m14 6-6 6 6 6" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m10 6 6 6-6 6" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 10 6 6 6-6" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m4 12.5 5 5L20 6.5" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="m6 6 12 12M18 6 6 18" /></Svg>;
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M12 4.5 2.8 20h18.4L12 4.5Z" /><path d="M12 10v4M12 17.2v.1" /></Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.1" /></Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.8 19a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9M17.6 13.4A6.2 6.2 0 0 1 21.2 19" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.7-3-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.5 3h-3.4l-.3 2.5a7.6 7.6 0 0 0-2.6 1.5l-2-.8-1.7 3 1.7 1.3a7.6 7.6 0 0 0 0 3L4.5 14.8l1.7 3 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.5h3.4l.3-2.5a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.7-3-1.7-1.3Z" /></Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1" /></Svg>
);
export const IconHome = (p: P) => (
  <Svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M11 8l-4 4 4 4M7 12h9" /></Svg>
);
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M4 19h16" /></Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" /></Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}><path d="M12 15V4m0 0 3.5 3.5M12 4 8.5 7.5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" /></Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}><path d="M12 3l7 3v6c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const IconCard = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></Svg>
);
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const IconBell = (p: P) => (
  <Svg {...p}><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8 10V8a4 4 0 0 1 8 0v2" /></Svg>
);
export const IconStethoscope = (p: P) => (
  <Svg {...p}><path d="M6 4v5a4 4 0 0 0 8 0V4" /><path d="M10 13v3a4 4 0 0 0 8 0v-2" /><circle cx="18" cy="11" r="2" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></Svg>
);
export const IconSparkle = (p: P) => (
  <Svg {...p}><path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4Z" /></Svg>
);
