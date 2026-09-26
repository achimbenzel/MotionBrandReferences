import { ChevronRight, Plus } from 'lucide-react';
import { blockMeta } from './blockMeta.js';
import { blockSummary, EMPTY_HINT } from '../../lib/planTabs.js';
import BlockPeek from './BlockPeek.jsx';

/**
 * A block as one line: folded (its summary and a glimpse of the content) or
 * still empty ("Moodboard — empty · drop or add images"). A click opens it.
 */
export default function BlockRow({ plan, block: b, empty = false, color, menu, onOpen, dropProps }) {
  const Meta = blockMeta(b.type);
  return (
    <div className={`section block block-row ${empty ? 'is-empty' : 'is-folded'}`} id={`block-${b.id}`} data-block={b.id} style={{ '--tab-fg': color }} {...(dropProps || {})}>
      <button type="button" className="block-row-main" onClick={onOpen} aria-expanded="false"
        title={empty ? `Open “${b.title || Meta.label}”` : `Unfold “${b.title || Meta.label}”`}>
        {empty ? <Plus size={15} className="block-row-chev" /> : <ChevronRight size={15} className="block-row-chev" />}
        <Meta.icon size={15} className="block-row-icon" />
        <span className="block-row-title">{b.title || Meta.label}</span>
        <span className="block-row-sum">{empty ? `empty — ${EMPTY_HINT[b.type] || 'add content'}` : blockSummary(b)}</span>
        {!empty && <span className="block-row-peek"><BlockPeek plan={plan} block={b} compact /></span>}
      </button>
      {menu}
    </div>
  );
}
