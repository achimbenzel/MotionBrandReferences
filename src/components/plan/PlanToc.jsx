import { useEffect, useState } from 'react';
import { LayoutDashboard, ListTree } from 'lucide-react';
import { blockMeta } from './blockMeta.js';
import Menu from '../Menu.jsx';
import { PLAN_TABS, STRUCTURAL, blockSummary, isEmptyBlock, tabColor } from '../../lib/planTabs.js';

// The plan's blocks by tab, as the contents list shows them.
function groupsOf(plan, tabs) {
  return PLAN_TABS.slice(1).map((t) => ({
    ...t,
    blocks: (plan.blocks || []).map((b, i) => ({ b, i })).filter(({ b, i }) => tabs[i] === t.key && !STRUCTURAL.has(b.type)).map(({ b }) => b),
  })).filter((g) => g.blocks.length);
}

// The block that's at the top of the window right now (for the highlight).
function useBlockInView(deps) {
  const [id, setId] = useState(null);
  useEffect(() => {
    let raf = 0;
    const look = () => {
      raf = 0;
      let cur = null;
      for (const el of document.querySelectorAll('[data-block]')) {
        if (el.getBoundingClientRect().top < 150) cur = el.dataset.block; else break;
      }
      setId(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(look); };
    look();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return id;
}

/**
 * The plan's contents at the right edge (wide screens): every block with its
 * icon and where it stands, by tab — a click shows it (switching tab,
 * unfolding it). The block in view is highlighted.
 */
export function PlanToc({ plan, tabs, tab, onOpen, onTab }) {
  const inView = useBlockInView([tab, plan.blocks.length]);
  const groups = groupsOf(plan, tabs);
  return (
    <nav className="plan-toc" aria-label="Contents">
      <div className="plan-toc-inner">
        <div className="plan-toc-head"><ListTree size={13} /> Contents</div>
        <button type="button" className={`plan-toc-tab ${tab === 'overview' ? 'on' : ''}`} onClick={() => onTab('overview')}>
          <LayoutDashboard size={13} /> Overview
        </button>
        {groups.map((g) => {
          const c = tabColor(g.key);
          return (
            <div key={g.key} className={`plan-toc-group ${tab === g.key ? 'on' : ''}`} style={{ '--tab-fg': c.fg }}>
              <button type="button" className="plan-toc-tab" onClick={() => onTab(g.key)}>
                <span className="status-dot" style={{ background: c.fg }} /> {g.label}
              </button>
              {g.blocks.map((b) => {
                const Meta = blockMeta(b.type);
                const empty = isEmptyBlock(b);
                return (
                  <button key={b.id} type="button" className={`plan-toc-item ${inView === b.id && tab === g.key ? 'here' : ''} ${empty ? 'empty' : ''}`}
                    onClick={() => onOpen(b.id)} title={`${b.title || Meta.label}${empty ? ' — empty' : ` — ${blockSummary(b)}`}`}>
                    <Meta.icon size={13} />
                    <span className="plan-toc-title">{b.title || Meta.label}</span>
                    <span className="plan-toc-sum">{empty ? 'empty' : blockSummary(b)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** The same contents as a "Jump to…" menu (narrower screens, phones). */
export function PlanJump({ plan, tabs, onOpen }) {
  const groups = groupsOf(plan, tabs);
  if (!groups.length) return null;
  const items = groups.flatMap((g, gi) => [
    ...(gi ? [{ separator: true }] : []),
    ...g.blocks.map((b) => {
      const Meta = blockMeta(b.type);
      return {
        label: `${b.title || Meta.label}${isEmptyBlock(b) ? ' · empty' : ''}`,
        icon: <span className="plan-jump-icon" style={{ color: tabColor(g.key).fg }}><Meta.icon size={15} /></span>,
        onClick: () => onOpen(b.id),
      };
    }),
  ]);
  return (
    <span className="plan-jump">
      <Menu align="right" title="Jump to" trigger={<button type="button" className="btn btn-sm btn-ghost" aria-label="Jump to a block"><ListTree size={14} /><span className="plan-jump-label"> Jump to…</span></button>} items={items} />
    </span>
  );
}
