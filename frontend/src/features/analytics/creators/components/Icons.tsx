const base = { 'aria-hidden': true as const };

export const ChevIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M3 5.5L7 9.5L11 5.5" />
  </svg>
);
export const CheckIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M2.5 6.5L5 9L9.5 3.5" />
  </svg>
);
export const XIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...base}>
    <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" />
  </svg>
);
export const CloseIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...base}>
    <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" />
  </svg>
);
export const SearchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...base}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);
export const SortIcon = ({ dir }: { dir: 'asc' | 'desc' | null }) =>
  dir === 'asc' ? (
    <svg viewBox="0 0 11 11" fill="currentColor" {...base}><path d="M5.5 2L9.5 7.5H1.5z" /></svg>
  ) : dir === 'desc' ? (
    <svg viewBox="0 0 11 11" fill="currentColor" {...base}><path d="M5.5 9L1.5 3.5H9.5z" /></svg>
  ) : (
    <svg viewBox="0 0 11 11" fill="currentColor" opacity="0.35" {...base}><path d="M5.5 1L8.5 4.5H2.5zM5.5 10L2.5 6.5H8.5z" /></svg>
  );
export const DoneIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <circle cx="7" cy="7" r="5.8" strokeWidth="1.5" />
    <path d="M4.5 7.2L6.3 9L9.6 5.2" />
  </svg>
);

export const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16v.1" />
  </svg>
);

/** Platform as a small icon chip. The name stays available to screen readers and as a hover title. */
export function PlatformIcon({ platform, label }: { platform: string; label: string }) {
  const p = ['instagram', 'youtube', 'linkedin', 'facebook'].includes(platform) ? platform : 'other';
  const glyph = {
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    youtube: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
      </>
    ),
    linkedin: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.5 2.3-2.5S16 11.2 16 13v3" />
      </>
    ),
    facebook: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M13.5 20v-6.5h2.2l.4-2.6h-2.6V9.5c0-.8.4-1.3 1.4-1.3h1.3V5.9c-.4-.1-1.2-.2-2-.2-2 0-3.2 1.2-3.2 3.3v1.9H9v2.6h2.4V20" />
      </>
    ),
    other: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
  }[p];
  return (
    <span className={`cc-pi cc-pi-${p}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {glyph}
      </svg>
    </span>
  );
}

export const DownloadIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M8 2.5v7.5M4.8 7.2L8 10.3l3.2-3.1M3 13h10" />
  </svg>
);
export const ExternalIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M6.5 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9.5M9.5 2.5h4v4M13.3 2.7L7.5 8.5" />
  </svg>
);
export const LockIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <rect x="3.2" y="7" width="9.6" height="6.5" rx="1.6" />
    <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
  </svg>
);
export const PencilIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M2.8 13.2l.6-2.9 7-7a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2l-7 7zM9.4 4.3l2.3 2.3" />
  </svg>
);
export const ChevRightIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </svg>
);
