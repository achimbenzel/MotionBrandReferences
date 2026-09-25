import { useEffect, useRef, useState } from 'react';
import { fmtDur, targetState } from '../../lib/timing.js';

/**
 * A small numeric field that keeps what you type while you type it ("2,", "")
 * and reports parsed values; `null` when emptied (if `allowEmpty`).
 */
export function NumberField({ value, onChange, min = 0.1, max = 3600, allowEmpty = false, placeholder, className = '', ...rest }) {
  const shown = value == null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(shown); }, [shown]);
  return (
    <input
      className={className}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setDraft(shown); }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (!raw.trim()) { if (allowEmpty) onChange(null); return; }
        const n = parseFloat(raw.replace(',', '.'));
        if (Number.isFinite(n) && n > 0) onChange(Math.min(max, Math.max(min, Math.round(n * 10) / 10)));
      }}
      {...rest}
    />
  );
}

/**
 * "≈ 27.4 s of [30] s" with a fill bar. The target is the block's own, or —
 * while that's empty — the briefing's target length (shown as a placeholder).
 */
export function TargetMeter({ total, own, briefing, onTarget, approx = false }) {
  const target = own ?? briefing;
  const state = targetState(total, target);
  return (
    <div className={`tmeter ${state || ''}`}>
      <span className="tmeter-total">{approx ? '≈ ' : ''}{fmtDur(total)}</span>
      <span className="tmeter-of">of</span>
      <label className="tmeter-target" title="Target length in seconds">
        <NumberField value={own} allowEmpty min={1} placeholder={briefing ? String(briefing) : '—'}
          onChange={onTarget} aria-label="Target length in seconds" />
        <span>s</span>
      </label>
      {own == null && briefing ? <span className="tmeter-src">from briefing</span> : null}
      {target ? (
        <span className="tmeter-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (total / target) * 100)}%` }} />
        </span>
      ) : null}
      {state === 'over' && <span className="tmeter-diff">{fmtDur(total - target)} too long</span>}
    </div>
  );
}
