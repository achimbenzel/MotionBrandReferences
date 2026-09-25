import { useState } from 'react';
import { Plus, Copy, MoreHorizontal, ArrowUp, ArrowDown, Trash2, CopyPlus, ChevronDown, StickyNote } from 'lucide-react';
import Menu from '../Menu.jsx';
import { tagColor } from '../../lib/types.js';

const rid = () => Math.random().toString(36).slice(2, 8);

export const DELIVERABLE_STATUS = [
  { key: 'open', label: 'Open', color: 'gray' },
  { key: 'rendering', label: 'Rendering', color: 'orange' },
  { key: 'review', label: 'In review', color: 'yellow' },
  { key: 'delivered', label: 'Delivered', color: 'green' },
];
const statusOf = (key) => DELIVERABLE_STATUS.find((s) => s.key === key) || DELIVERABLE_STATUS[0];

// Typical resolution for a format — filled in when the resolution is still empty.
const FORMAT_RES = {
  '16:9': '1920 × 1080', '9:16': '1080 × 1920', '1:1': '1080 × 1080', '4:5': '1080 × 1350', '4:3': '1440 × 1080', '21:9': '2560 × 1080',
};
const SUGGEST = {
  aspect: Object.keys(FORMAT_RES),
  resolution: ['3840 × 2160', '1920 × 1080', '1280 × 720', '2160 × 3840', '1080 × 1920', '1080 × 1080', '1080 × 1350', '1440 × 1080', '2560 × 1080'],
  fps: ['23.976', '24', '25', '29.97', '30', '50', '60'],
  codec: ['H.264', 'H.265 / HEVC', 'ProRes 422', 'ProRes 422 HQ', 'ProRes 4444', 'VP9 / WebM', 'GIF', 'PNG sequence'],
};
const item = (p = {}) => ({ id: rid(), name: '', aspect: '', resolution: '', fps: '', codec: '', length: '', status: 'open', notes: '', ...p });
const PRESETS = [
  { label: 'Master 16:9 (4K)', items: [{ name: 'Master', aspect: '16:9', resolution: '3840 × 2160', codec: 'H.264' }] },
  { label: 'ProRes master', items: [{ name: 'Master ProRes', aspect: '16:9', resolution: '3840 × 2160', codec: 'ProRes 422 HQ' }] },
  {
    label: 'Social set — 9:16 · 1:1 · 4:5',
    items: [
      { name: 'Social vertical', aspect: '9:16', resolution: '1080 × 1920', codec: 'H.264' },
      { name: 'Feed square', aspect: '1:1', resolution: '1080 × 1080', codec: 'H.264' },
      { name: 'Feed portrait', aspect: '4:5', resolution: '1080 × 1350', codec: 'H.264' },
    ],
  },
  {
    label: 'Cutdowns — 15 s · 6 s',
    items: [
      { name: 'Cutdown', aspect: '16:9', resolution: '1920 × 1080', codec: 'H.264', length: '15 s' },
      { name: 'Bumper', aspect: '16:9', resolution: '1920 × 1080', codec: 'H.264', length: '6 s' },
    ],
  },
];
const COLS = [
  { key: 'aspect', label: 'Format' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'fps', label: 'fps' },
  { key: 'codec', label: 'Codec' },
  { key: 'length', label: 'Length' },
];

/**
 * Deliverables block: every export to hand over — format, resolution, fps,
 * codec, length — and where each one stands (open → rendering → in review →
 * delivered). Presets add common sets; Copy gives a spec list for the render
 * queue or the client.
 */
export default function DeliverablesBlock({ plan, block: b, menu, icon: Icon, editBlock, planRef, toast }) {
  const items = b.items || [];
  const [noteOpen, setNoteOpen] = useState(() => new Set());
  const latest = () => (planRef.current?.blocks || []).find((x) => x.id === b.id)?.items || items;
  const setItems = (next, immediate = false) => editBlock(b.id, { items: next }, immediate);
  const patch = (id, p, immediate = false) => setItems(latest().map((d) => (d.id === id ? { ...d, ...p } : d)), immediate);
  const add = (list) => setItems([...latest(), ...list.map((p) => item(p))], true);
  const move = (i, d) => {
    const next = [...latest()]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next, true);
  };
  const remove = (d, i) => {
    setItems(latest().filter((x) => x.id !== d.id), true);
    toast(`“${d.name || 'Deliverable'}” removed`, 'ok', { label: 'Undo', onClick: () => {
      const next = [...latest()]; next.splice(Math.min(i, next.length), 0, d); setItems(next, true);
    } });
  };
  const setAspect = (d, aspect) => patch(d.id, { aspect, ...(!d.resolution.trim() && FORMAT_RES[aspect.trim()] ? { resolution: FORMAT_RES[aspect.trim()] } : {}) });

  const done = items.filter((d) => d.status === 'delivered').length;
  const spec = (d) => [d.aspect, d.resolution, d.fps && `${d.fps} fps`, d.codec, d.length].filter((x) => x && String(x).trim()).join(' · ');
  const copy = async () => {
    const lines = items.map((d) => `${d.status === 'delivered' ? '[x]' : '[ ]'} ${d.name || 'Deliverable'} — ${spec(d) || '—'}${d.status !== 'open' && d.status !== 'delivered' ? ` (${statusOf(d.status).label.toLowerCase()})` : ''}`);
    try { await navigator.clipboard.writeText(`${plan.name} — ${b.title}\n\n${lines.join('\n')}`); toast('Deliverables copied'); }
    catch { toast('Copy failed', 'error'); }
  };
  const addMenu = [
    { label: 'One deliverable', icon: <Plus size={15} />, onClick: () => add([{}]) },
    { separator: true },
    ...PRESETS.map((p) => ({ label: p.label, icon: <CopyPlus size={15} />, onClick: () => add(p.items) })),
  ];
  const listId = (key) => `dl-${b.id}-${key}`;

  return (
    <div className="section block" id={`block-${b.id}`}>
      <div className="section-head">
        <h2>
          <Icon size={16} /> {b.title}
          {items.length > 0 && <span className="count">{done}/{items.length} delivered</span>}
        </h2>
        <div className="moodboard-actions">
          {items.length > 0 && <button className="btn btn-sm" onClick={copy}><Copy size={14} /> Copy</button>}
          <Menu align="right" title="Add deliverables" items={addMenu}
            trigger={<button className="btn btn-sm"><Plus size={14} /> Add <ChevronDown size={13} /></button>} />
          {menu}
        </div>
      </div>

      {items.length > 0 && (
        <div className="dl-progress" aria-hidden="true"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
      )}

      {items.length ? (
        <div className="dl">
          <div className="dl-row dl-head" aria-hidden="true">
            <span>Status</span><span>Deliverable</span>{COLS.map((c) => <span key={c.key}>{c.label}</span>)}<span />
          </div>
          {items.map((d, i) => {
            const st = statusOf(d.status);
            const c = tagColor(st.color);
            return (
              <div key={d.id} className={`dl-row ${d.status === 'delivered' ? 'is-done' : ''}`}>
                <Menu align="left" title="Status"
                  trigger={<button className="dl-status" style={{ background: c.bg, color: c.fg }} aria-label={`Status: ${st.label}`}>{st.label} <ChevronDown size={12} /></button>}
                  items={DELIVERABLE_STATUS.map((s) => ({
                    label: s.label, icon: <span className="status-dot" style={{ background: tagColor(s.color).fg }} />, onClick: () => patch(d.id, { status: s.key }, true),
                  }))} />
                <input className="dl-cell dl-name" value={d.name} placeholder="Name…" aria-label="Deliverable"
                  onChange={(e) => patch(d.id, { name: e.target.value })} />
                {COLS.map((col) => (
                  <label key={col.key} className="dl-field" data-label={col.label}>
                    <input className={`dl-cell dl-${col.key}`} value={d[col.key]} placeholder="—" list={listId(col.key)} aria-label={col.label}
                      onChange={(e) => (col.key === 'aspect' ? setAspect(d, e.target.value) : patch(d.id, { [col.key]: e.target.value }))} />
                  </label>
                ))}
                <Menu align="right" title={d.name || 'Deliverable'}
                  trigger={<button className="icon-btn dl-menu" aria-label="Deliverable options"><MoreHorizontal size={15} /></button>}
                  items={[
                    ...(!d.notes && !noteOpen.has(d.id) ? [{ label: 'Add note', icon: <StickyNote size={15} />, onClick: () => setNoteOpen((set) => new Set(set).add(d.id)) }] : []),
                    { label: 'Duplicate', icon: <CopyPlus size={15} />, onClick: () => { const next = [...latest()]; next.splice(i + 1, 0, { ...d, id: rid(), status: 'open' }); setItems(next, true); } },
                    ...(i > 0 ? [{ label: 'Move up', icon: <ArrowUp size={15} />, onClick: () => move(i, -1) }] : []),
                    ...(i < items.length - 1 ? [{ label: 'Move down', icon: <ArrowDown size={15} />, onClick: () => move(i, 1) }] : []),
                    { separator: true },
                    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(d, i) },
                  ]} />
                {(d.notes || noteOpen.has(d.id)) && (
                  <input className="dl-cell dl-notes" value={d.notes} placeholder="Note — e.g. subtitles burnt in, loudness −14 LUFS…" aria-label="Note"
                    autoFocus={!d.notes} onChange={(e) => patch(d.id, { notes: e.target.value })} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dl-empty">
          <span>Start with a set:</span>
          {PRESETS.map((p) => <button key={p.label} className="chip" onClick={() => add(p.items)}>{p.label}</button>)}
          <button className="chip" onClick={() => add([{}])}><Plus size={13} /> Empty row</button>
        </div>
      )}
      {Object.entries(SUGGEST).map(([key, values]) => (
        <datalist key={key} id={listId(key)}>{values.map((v) => <option key={v} value={v} />)}</datalist>
      ))}
    </div>
  );
}

/**
 * Turn a table (e.g. a "Deliverables" table from before this block existed)
 * into deliverables: columns are matched by name — format / resolution / fps /
 * codec / length / status — and anything else goes into the notes.
 */
export function tableToDeliverables(table) {
  const cols = table.columns || [];
  const find = (re) => cols.find((c) => re.test(String(c.name || '')));
  const cAspect = find(/aspect|ratio|seitenverh/i);
  const cRes = find(/resolution|auflösung|size|größe|pixel/i);
  const cFps = find(/fps|frame ?rate|bildrate/i);
  const cCodec = find(/codec/i);
  const cLen = find(/length|länge|dauer|duration|laufzeit/i);
  const cStatus = find(/status|stand/i);
  const cName = find(/^(format|name|deliverable|asset|version|titel|output|datei)/i) || cols.find((c) => ![cAspect, cRes, cFps, cCodec, cLen, cStatus].includes(c)) || cols[0];
  const used = new Set([cName, cAspect, cRes, cFps, cCodec, cLen, cStatus].filter(Boolean).map((c) => c.id));
  const toStatus = (v) => (/deliver|done|fertig|geliefert|erledigt|✓/i.test(v) ? 'delivered'
    : /render|export/i.test(v) ? 'rendering' : /review|feedback|abnahme/i.test(v) ? 'review' : 'open');
  return (table.rows || []).map((r) => {
    const cell = (c) => (c ? String(r.cells?.[c.id] ?? '').trim() : '');
    const name = cell(cName);
    return item({
      name,
      aspect: cell(cAspect) || (name.match(/\b(\d{1,2}:\d{1,2})\b/)?.[1] ?? ''),
      resolution: cell(cRes),
      fps: cell(cFps),
      codec: cell(cCodec),
      length: cell(cLen),
      status: toStatus(cell(cStatus)),
      notes: cols.filter((c) => !used.has(c.id)).map((c) => { const v = cell(c); return v ? `${c.name || 'Note'}: ${v}` : ''; }).filter(Boolean).join(' · '),
    });
  }).filter((d) => d.name || d.aspect || d.resolution);
}
