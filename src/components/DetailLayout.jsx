/**
 * Body of a project detail page: the work itself (media, palette, frames…) in
 * one centred column, then `side` (tags, notes) as a row below it — side by
 * side on wide screens, stacked on narrow ones. A page that wants that row
 * somewhere else renders <DetailSide> there itself and leaves `side` out.
 */
export function DetailSide({ children }) {
  return <div className="pd-details">{children}</div>;
}

export default function DetailLayout({ side, children }) {
  return (
    <div className="pd-layout">
      {children}
      {side && <DetailSide>{side}</DetailSide>}
    </div>
  );
}
