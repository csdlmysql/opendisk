// Inline SVG icons — no emoji, no font/icon library import.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, rest: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function FolderIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function FileIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function DiskIcon({ size = 44, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function TrashIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function RevealIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M11 13l3-3M14 10h-2m2 0v2" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14-4.5L4 8m0 0V4m0 4h4" />
      <path d="M4 13a8 8 0 0 0 14 4.5L20 16m0 0v4m0-4h-4" />
    </svg>
  );
}

export function SwapIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M7 4L3 8l4 4" />
      <path d="M3 8h14" />
      <path d="M17 20l4-4-4-4" />
      <path d="M21 16H7" />
    </svg>
  );
}

// ---- Category icons (small, used in the Files finder) ----
export function ImageIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="M21 15l-5-5-8 8" />
    </svg>
  );
}

export function VideoIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}

export function AudioIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

export function ArchiveIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

export function AppIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function DocumentIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

export function CodeIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M8 8l-4 4 4 4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M13 6l-2 12" />
    </svg>
  );
}

export function OtherFileIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function DownloadIcon({ size = 15, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M12 4v11m0 0l-4-4m4 4l4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, ...rest }: P) {
  return (
    <svg {...base(size, rest)} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
