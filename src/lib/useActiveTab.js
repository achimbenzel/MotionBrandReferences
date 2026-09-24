import { useEffect, useState } from 'react';
import { activeTab } from './types.js';

/** The current Reference section for a path, updated when a detail page reports its type. */
export function useActiveTab(pathname) {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('lasttab', on);
    return () => window.removeEventListener('lasttab', on);
  }, []);
  return activeTab(pathname);
}
