/**
 * A slider in the app's style: a thin track that fills up to the thumb.
 * Takes the same props as <input type="range">.
 */
export default function Range({ className = '', style, onInput, ...props }) {
  const min = Number(props.min ?? 0); const max = Number(props.max ?? 100);
  const v = Number(props.value ?? props.defaultValue ?? min);
  const fill = (x) => `${Math.min(100, Math.max(0, max > min ? ((x - min) / (max - min)) * 100 : 0))}%`;
  return (
    <input type="range" className={`range ${className}`} style={{ ...style, '--p': fill(v) }} {...props}
      onInput={(e) => { e.currentTarget.style.setProperty('--p', fill(Number(e.currentTarget.value))); onInput?.(e); }} />
  );
}
