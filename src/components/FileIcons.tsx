// Monochrome line/fill icons for the folder explorer (server-safe, pure SVG).

export function FolderIcon({ size = 18, accent = "#2b6744", soft = "#e8f1ea" }: { size?: number; accent?: string; soft?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M3 7a2 2 0 0 1 2-2h3.4l1.8 1.8H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill={soft} stroke={accent} strokeWidth={1.6} />
    </svg>
  );
}

export function FileIcon({ size = 18, accent = "#2b6744" }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#fff" stroke={accent} strokeWidth={1.5} />
      <path d="M13 3v5h5" stroke={accent} strokeWidth={1.5} />
      <path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3" stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
    </svg>
  );
}

export function HomeIcon({ size = 18, color = "#63706a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

export function GridIcon({ size = 18, color = "#63706a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  );
}
