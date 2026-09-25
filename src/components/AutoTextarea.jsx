import { useLayoutEffect, useRef } from 'react';

/** A textarea that grows with its content. */
export default function AutoTextarea({ value, className = '', ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} value={value} {...rest} />;
}
