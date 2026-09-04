import { useState } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Editable tag list. `autoTags` are shown but not removable (e.g. the auto
 * video-length tag). `suggestions` offer quick-add chips.
 */
export default function TagInput({ tags, onChange, autoTags = [], suggestions = [], placeholder = 'Add tag…' }) {
  const [value, setValue] = useState('');

  const add = (raw) => {
    const t = raw.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setValue('');
  };
  const remove = (t) => onChange(tags.filter((x) => x !== t));

  const openSuggestions = suggestions.filter((s) => !tags.includes(s));

  return (
    <div>
      <div className="taglist">
        {autoTags.map((t) => (
          <span key={`auto-${t}`} className="tag auto" title="Automatic tag">{t}</span>
        ))}
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
            <span className="x" onClick={() => remove(t)}><X size={12} /></span>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 140, padding: '6px 10px' }}
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
          {openSuggestions.map((s) => (
            <button key={s} type="button" className="tag tag-add" onClick={() => add(s)}>
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
