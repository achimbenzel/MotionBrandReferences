import { useMemo, useRef, useState } from 'react';
import { Building2, Plus, Check, ArrowUpRight, X } from 'lucide-react';
import Popover from './Popover.jsx';
import ClientAvatar from './ClientAvatar.jsx';
import { isTouch } from '../lib/useMedia.js';

/**
 * A project's client in its header: the chip shows who it's for; a click
 * finds another one, makes a new one ("Create …"), takes it away, or opens
 * the client's page.
 */
export default function ClientPicker({ clients, value, onPick, onCreate, onOpen }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const current = clients.find((c) => c.id === value) || null;
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => clients.filter((c) => !needle || c.name.toLowerCase().includes(needle)), [clients, needle]);
  const exact = clients.some((c) => c.name.toLowerCase() === needle);
  const close = () => { setOpen(false); setQ(''); };
  const pick = (id) => { close(); if (id !== value) onPick(id); };
  const create = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try { await onCreate(q.trim()); close(); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" ref={anchor} className={`plan-client-chip ${current ? '' : 'empty'}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}>
        {current ? <ClientAvatar client={current} size="sm" /> : <Building2 size={15} />}
        <span>{current ? current.name : 'Add client'}</span>
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} width={300} label="Client">
          <div className="cpick">
            <input className="input cpick-search" value={q} autoFocus={!isTouch()} placeholder="Find or add a client…" aria-label="Find or add a client"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (list.length === 1 || (exact && list.length)) pick((list.find((c) => c.name.toLowerCase() === needle) || list[0]).id);
                else if (needle) create();
              }} />
            <div className="cpick-list">
              {list.map((c) => (
                <button key={c.id} type="button" className={`cpick-item ${c.id === value ? 'on' : ''}`} onClick={() => pick(c.id)}>
                  <ClientAvatar client={c} size="sm" /><span>{c.name}</span>{c.id === value && <Check size={14} />}
                </button>
              ))}
              {needle && !exact && (
                <button type="button" className="cpick-item cpick-new" onClick={create} disabled={busy}>
                  <span className="cpick-plus"><Plus size={14} /></span><span>Create “{q.trim()}”</span>
                </button>
              )}
              {!list.length && !needle && <div className="cpick-empty">No clients yet — type a name to add one.</div>}
            </div>
            {current && (
              <div className="cpick-foot">
                <button type="button" className="cpick-item" onClick={() => { close(); onOpen(current.id); }}><ArrowUpRight size={15} /><span>Open {current.name}</span></button>
                <button type="button" className="cpick-item" onClick={() => pick(null)}><X size={15} /><span>No client</span></button>
              </div>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
