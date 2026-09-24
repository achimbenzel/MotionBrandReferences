import { useEffect, useState } from 'react';

// Breakpoints shared with styles.css.
export const DESKTOP = '(min-width: 900px)';   // sidebar is docked (below: drawer + top bar)
export const PHONE = '(max-width: 640px)';     // menus become bottom sheets
export const TOUCH = '(hover: none), (pointer: coarse)';

const query = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/** Live `matchMedia` result for a CSS media query. */
export function useMediaQuery(q) {
  const [matches, setMatches] = useState(() => !!query(q)?.matches);
  useEffect(() => {
    const mq = query(q);
    if (!mq) return undefined;
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return matches;
}

/** One-off check (outside React render cycles, e.g. for autoFocus). */
export const isTouch = () => !!query(TOUCH)?.matches;
