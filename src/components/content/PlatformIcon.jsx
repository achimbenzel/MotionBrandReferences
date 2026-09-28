// Small monochrome platform marks (lucide has no TikTok, and its brand icons are going away).
const PATHS = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
    </>
  ),
  tiktok: <path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.7 3.9 3.9v3.1c-1.4.1-2.7-.3-3.9-1v6.1c0 3.6-2.6 6-5.9 6-3.4 0-5.8-2.6-5.4-6 .4-3 3-5 6.2-4.6v3.2c-1.5-.4-3 .5-3.1 2-.1 1.4 1 2.4 2.3 2.4 1.4 0 2.4-1 2.4-2.6V3h3.5z" />,
  x: <path fill="currentColor" d="M17.6 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.7 3h6.4l4.4 5.9L17.6 3zm-1.1 16.2h1.7L7.5 4.7H5.7l10.8 14.5z" />,
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="currentColor" d="M10 9l5 3-5 3z" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="currentColor" d="M7.2 10h2v7h-2zM8.2 6.7a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM11 10h1.9v1c.4-.7 1.2-1.2 2.3-1.2 2 0 2.6 1.3 2.6 3V17h-2v-3.8c0-.9-.2-1.7-1.2-1.7s-1.5.7-1.5 1.7V17h-2z" />
    </>
  ),
};

export default function PlatformIcon({ platform, size = 14, className = '', title }) {
  const p = PATHS[platform];
  if (!p) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`platform-icon ${className}`} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {p}
    </svg>
  );
}
