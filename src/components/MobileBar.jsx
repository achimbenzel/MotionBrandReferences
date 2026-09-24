import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu as MenuIcon, Search, Plus } from 'lucide-react';
import { TABS, WORK_TABS, isWorkPath } from '../lib/types.js';
import { useActiveTab } from '../lib/useActiveTab.js';

// Title for the current page, shown in the middle of the bar.
function titleFor(pathname, tab) {
  const work = WORK_TABS.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
  if (work) return work.label;
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/trash') return 'Trash';
  return TABS.find((t) => t.key === tab)?.label || 'Library';
}

/**
 * Phone / tablet top bar (below the desktop breakpoint): menu button that opens
 * the sidebar as a drawer, the page title, search and add. It slides away while
 * you scroll down and comes back as soon as you scroll up.
 */
export default function MobileBar({ onMenu, onSearch, onAdd }) {
  const { pathname } = useLocation();
  const tab = useActiveTab(pathname);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.max(0, window.scrollY);
        setScrolled(y > 64);
        const dy = y - last.current;
        if (Math.abs(dy) > 6) { setHidden(dy > 0 && y > 72); last.current = y; }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setHidden(false); setScrolled(window.scrollY > 64); last.current = window.scrollY; }, [pathname]);

  const workMode = isWorkPath(pathname);
  const onPlan = pathname === '/plan' || pathname.startsWith('/plan/');
  const showAdd = pathname !== '/trash' && (!workMode || onPlan); // nothing to add on the Logo Tester, To-Dos…
  // Section pages have their own big title at the top; detail pages don't.
  const sectionPage = !/^\/(project|gallery|plan|software)\/./.test(pathname);

  return (
    <header className={`mbar ${hidden ? 'mbar-hidden' : ''}`}>
      <button className="icon-btn mbar-btn" onClick={onMenu} aria-label="Open menu"><MenuIcon size={20} /></button>
      <div className={`mbar-title ${sectionPage && !scrolled ? 'quiet' : ''}`}>{titleFor(pathname, tab)}</div>
      <button className="icon-btn mbar-btn" onClick={onSearch} aria-label="Search"><Search size={19} /></button>
      {showAdd && (
        <button className="icon-btn mbar-btn mbar-add" onClick={() => onAdd(tab)}
          aria-label={workMode ? 'New plan' : 'Add project'}><Plus size={20} /></button>
      )}
    </header>
  );
}
