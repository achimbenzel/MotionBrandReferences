import { useState } from 'react';
import { X, Plus, ChevronDown, ChevronUp } from 'lucide-react';

const SHOWN = 5; // quick-add suggestions visible before "More"

/**
 * Editable tag list. `autoTags` are shown but not removable (e.g. the auto
 * video-length tag). `suggestions` offer quick-add chips.
 */
export default function TagInput({ tags, onChange, autoTags = [], suggestions = [], placeholder = 'Add tag…' }) {
  const [value, setValue] = useState('');
  const [allSuggestions, setAllSuggestions] = useState(false);

  const add = (raw) => {
    const t = raw.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setValue('');
  };
  const remove = (t) => onChange(tags.filter((x) => x !== t));

  const openSuggestions = suggestions.filter((s) => !tags.includes(s));
  const visible = allSuggestions ? openSuggestions : openSuggestions.slice(0, SHOWN);
  const hiddenCount = openSuggestions.length - visible.length;

  return (
    <div>
      <div className="taglist">
        {autoTags.map((t) => (
          <span key={`auto-${t}`} className="tag auto" title="Automatic tag">{t}</span>
        ))}
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
            <button type="button" className="x" onClick={() => remove(t)} aria-label={`Remove tag ${t}`}><X size={12} /></button>
          </span>
        ))}
        <input
          className="input tag-entry"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(value); }
            if (e.key === 'Backspace' && !value && tags.length) remove(tags[tags.length - 1]);
          }}
          onBlur={() => add(value)}
        />
      </div>
      {openSuggestions.length > 0 && (
        <div className="taglist" style={{ marginTop: 10 }}>
          {visible.map((s) => (
            <button key={s} type="button" className="tag tag-add" onClick={() => add(s)}>
              <Plus size={11} /> {s}
            </button>
          ))}
          {(hiddenCount > 0 || allSuggestions) && openSuggestions.length > SHOWN && (
            <button type="button" className="tag tag-more" onClick={() => setAllSuggestions((v) => !v)}>
              {allSuggestions ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> {hiddenCount} more</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
