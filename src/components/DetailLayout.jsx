/**
 * Body of a project detail page: the work itself (media, palette, frames…) in
 * the main column, and `side` (tags, notes) next to it on wide screens —
 * sticky, so notes stay in view while you look through the work. Narrower
 * screens stack the side content below.
 */
export default function DetailLayout({ side, children }) {
  return (
    <div className={`dl ${side ? 'dl-has-side' : ''}`}>
      <div className="dl-main">{children}</div>
      {side && <aside className="dl-side">{side}</aside>}
    </div>
  );
}
