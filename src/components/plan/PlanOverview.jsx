import { ArrowRight } from 'lucide-react';
import { blockMeta } from './blockMeta.js';
import BlockPeek from './BlockPeek.jsx';
import { PLAN_TABS, STRUCTURAL, blockSummary, isEmptyBlock, tabColor } from '../../lib/planTabs.js';

/**
 * The plan at a glance: per phase a card for every block with content (its
 * summary and a glimpse), and the blocks that are still empty as chips.
 * A card or chip opens the block in its tab.
 */
export default function PlanOverview({ plan, tabs, onOpen, onTab }) {
  const groups = PLAN_TABS.slice(1).map((t) => {
    const blocks = (plan.blocks || []).filter((b, i) => tabs[i] === t.key && !STRUCTURAL.has(b.type));
    return { ...t, filled: blocks.filter((b) => !isEmptyBlock(b)), empty: blocks.filter(isEmptyBlock) };
  }).filter((g) => g.filled.length || g.empty.length);

  if (!groups.length) {
    return <div className="empty-hint pov-none">No blocks yet — pick a tab and add a block, or start the next plan from a template.</div>;
  }
  return (
    <div className="pov">
      {groups.map((g) => {
        const c = tabColor(g.key);
        return (
          <section className="pov-group" key={g.key} style={{ '--tab-fg': c.fg, '--tab-bg': c.bg }}>
            <button type="button" className="pov-group-head" onClick={() => onTab(g.key)}>
              <span className="pov-group-icon"><g.icon size={14} /></span>
              <span className="pov-group-title">{g.label}</span>
              <span className="pov-group-count">{g.filled.length}/{g.filled.length + g.empty.length} started</span>
              <ArrowRight size={14} className="pov-group-go" />
            </button>
            {g.filled.length > 0 && (
              <div className="pov-cards">
                {g.filled.map((b) => {
                  const Meta = blockMeta(b.type);
                  return (
                    <button type="button" key={b.id} className="pov-card" onClick={() => onOpen(b.id)}>
                      <span className="pov-card-head"><Meta.icon size={14} /> <span className="pov-card-title">{b.title || Meta.label}</span></span>
                      <span className="pov-card-sum">{blockSummary(b)}</span>
                      <BlockPeek plan={plan} block={b} />
                    </button>
                  );
                })}
              </div>
            )}
            {g.empty.length > 0 && (
              <div className="pov-empty">
                <span className="pov-empty-label">Still empty</span>
                {g.empty.map((b) => {
                  const Meta = blockMeta(b.type);
                  return <button type="button" key={b.id} className="pov-chip" onClick={() => onOpen(b.id)}><Meta.icon size={12} /> {b.title || Meta.label}</button>;
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
