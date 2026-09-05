/**
 * Renders a logo in a given "rendition":
 *   - 'original'  → the uploaded image as-is (keeps full colour)
 *   - '#rrggbb'   → the image recoloured to that colour (silhouette via CSS
 *                   mask; works for transparent SVG and PNG silhouettes)
 * `url` is a resolved image URL (data/blob/served). `scalePct` sizes it as a
 * percentage of its container (else it fills to contain).
 */
export default function LogoImage({ url, rendition = 'original', scalePct, alt = '' }) {
  if (!url) return null;
  const size = scalePct != null
    ? { width: `${scalePct}%`, height: `${scalePct}%` }
    : { maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' };

  if (rendition === 'original' || !rendition) {
    return <img src={url} alt={alt} loading="lazy" style={{ ...size, objectFit: 'contain', display: 'block' }} />;
  }
  return (
    <div
      className="logo-mask"
      role="img"
      aria-label={alt}
      style={{ ...size, background: rendition, WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }}
    />
  );
}
