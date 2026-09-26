import { useEffect, useRef } from 'react';
import { PLAN_TABS, tabColor } from '../../lib/planTabs.js';

/**
 * The plan's tab bar: Overview and one tab per phase, each with its colour and
 * how many blocks it holds; the tab of the plan's current phase has a dot.
 * `tools` go on the right (e.g. fold / unfold all).
 */
export default function PlanTabs({ active, counts, current, onPick, tools }) {
  const bar = useRef(null);
  // On a narrow screen the bar scrolls: keep the open tab in view.
  useEffect(() => {
    const el = bar.current; const tab = el?.querySelector('.plan-tab.on');
    if (!el || !tab) return;
    if (tab.offsetLeft < el.scrollLeft) el.scrollLeft = tab.offsetLeft - 8;
    else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + 8;
  }, [active]);
  return (
    <div className="plan-tabs-wrap">
      <div className="plan-tabs" role="tablist" aria-label="Plan sections" ref={bar}>
        {PLAN_TABS.map((t) => {
          const c = tabColor(t.key);
          const on = active === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} className={`plan-tab ${on ? 'on' : ''}`}
              style={{ '--tab-fg': c.fg, '--tab-bg': c.bg }} onClick={() => onPick(t.key)}
              title={current === t.key ? `${t.label} — where the plan stands` : t.label}>
              <t.icon size={15} />
              <span>{t.label}</span>
              {t.key !== 'overview' && counts?.[t.key] ? <span className="plan-tab-count">{counts[t.key]}</span> : null}
              {current === t.key && <span className="plan-tab-now" aria-label="current phase" />}
            </button>
          );
        })}
      </div>
      {tools && <div className="plan-tabs-tools">{tools}</div>}
    </div>
  );
}
