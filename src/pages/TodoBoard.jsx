import { useEffect, useRef, useState } from 'react';
import { Plus, X, MoreHorizontal, Trash2, Tag as TagIcon, GripVertical } from 'lucide-react';
import { api } from '../lib/api.js';
import { TAG_COLORS, tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';

const rid = () => Math.random().toString(36).slice(2, 10);

/** A single global Kanban planner: columns → cards → coloured tags, with
 *  native drag & drop to move cards within and across columns. */
export default function TodoBoard() {
  const toast = useToast();
  const [columns, setColumns] = useState(null);
  const [error, setError] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [focusCard, setFocusCard] = useState(null); // card id to autofocus after adding
  const [tagEditFor, setTagEditFor] = useState(null); // card id whose tag composer is open
  const [dragCard, setDragCard] = useState(null); // card id made draggable via its grip
  const dragRef = useRef(null); // { fromCol, cardId }
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    api.getBoard().then((b) => { if (alive) setColumns(b.columns); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  // Persist the whole board; text edits debounced, structural changes immediate.
  const commit = (next, immediate = false) => {
    setColumns(next);
    clearTimeout(timer.current);
    const send = () => api.saveBoard(next).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    if (immediate) send(); else timer.current = setTimeout(send, 500);
  };
  const mapCol = (colId, fn) => columns.map((c) => (c.id === colId ? fn(c) : c));
  const mapCard = (colId, cardId, fn) => mapCol(colId, (c) => ({ ...c, cards: c.cards.map((k) => (k.id === cardId ? fn(k) : k)) }));

  // Columns
  const addColumn = () => commit([...columns, { id: rid(), name: '', cards: [] }], true);
  const renameColumn = (colId, name) => commit(mapCol(colId, (c) => ({ ...c, name })));
  const removeColumn = (col) => {
    if (col.cards.length && !window.confirm(`Delete the “${col.name || 'Untitled'}” list and its ${col.cards.length} card(s)?`)) return;
    commit(columns.filter((c) => c.id !== col.id), true);
  };

  // Cards
  const addCard = (colId) => {
    const card = { id: rid(), title: '', tags: [] };
    setFocusCard(card.id);
    commit(mapCol(colId, (c) => ({ ...c, cards: [...c.cards, card] })), true);
  };
  const editCard = (colId, cardId, patch) => commit(mapCard(colId, cardId, (k) => ({ ...k, ...patch })));
  const removeCard = (colId, cardId) => commit(mapCol(colId, (c) => ({ ...c, cards: c.cards.filter((k) => k.id !== cardId) })), true);

  // Tags
  const addTag = (colId, cardId, label, color) => {
    const l = label.trim();
    commit(mapCard(colId, cardId, (k) => ({ ...k, tags: [...(k.tags || []), { id: rid(), label: l || 'Tag', color }] })), true);
  };
  const removeTag = (colId, cardId, tagId) => commit(mapCard(colId, cardId, (k) => ({ ...k, tags: (k.tags || []).filter((t) => t.id !== tagId) })), true);

  // Drag & drop
  const onCardDragStart = (e, colId, cardId) => {
    dragRef.current = { fromCol: colId, cardId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };
  const moveCard = (toColId, beforeCardId) => {
    const d = dragRef.current; dragRef.current = null; setDragOverCol(null);
    if (!d) return;
    if (d.cardId === beforeCardId) return; // dropped on itself
    let moving = null;
    const stripped = columns.map((c) => {
      if (c.id !== d.fromCol) return c;
      const card = c.cards.find((k) => k.id === d.cardId);
      if (card) moving = card;
      return { ...c, cards: c.cards.filter((k) => k.id !== d.cardId) };
    });
    if (!moving) return;
    const next = stripped.map((c) => {
      if (c.id !== toColId) return c;
      const cards = [...c.cards];
      const idx = beforeCardId ? cards.findIndex((k) => k.id === beforeCardId) : -1;
      if (idx === -1) cards.push(moving); else cards.splice(idx, 0, moving);
      return { ...c, cards };
    });
    commit(next, true);
  };

  if (error) return <div className="center-msg">Couldn’t load the board: {error}</div>;
  if (!columns) return <div className="spinner" />;

  const total = columns.reduce((n, c) => n + c.cards.length, 0);

  return (
    <div className="board-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>To-Dos</h1>
          <p>A general planner — add cards and drag them across your lists.</p>
        </div>
        <button className="btn btn-sm" onClick={addColumn}><Plus size={15} /> Add list</button>
      </div>

      <div className="kanban">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`kb-col ${dragOverCol === col.id ? 'dragover' : ''}`}
            onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setDragOverCol(col.id); } }}
            onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOverCol(null); }}
            onDrop={(e) => { e.preventDefault(); moveCard(col.id, null); }}
          >
            <div className="kb-col-head">
              <input className="kb-col-name" value={col.name} placeholder="List name…"
                onChange={(e) => renameColumn(col.id, e.target.value)} />
              <span className="kb-col-count">{col.cards.length}</span>
              <Menu
                align="right"
                trigger={<button className="icon-btn kb-col-menu" title="List options"><MoreHorizontal size={16} /></button>}
                items={[
                  { label: 'Add card', icon: <Plus size={15} />, onClick: () => addCard(col.id) },
                  { separator: true },
                  { label: 'Delete list', icon: <Trash2 size={15} />, danger: true, onClick: () => removeColumn(col) },
                ]}
              />
            </div>

            <div className="kb-cards">
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  className={`kb-card ${dragCard === card.id ? 'dragging' : ''}`}
                  draggable={dragCard === card.id}
                  onDragStart={(e) => onCardDragStart(e, col.id, card.id)}
                  onDragEnd={() => { dragRef.current = null; setDragCard(null); setDragOverCol(null); }}
                  onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); e.stopPropagation(); } }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); moveCard(col.id, card.id); }}
                >
                  <span className="kb-card-grip" title="Drag to move"
                    onMouseDown={() => setDragCard(card.id)} onMouseUp={() => setDragCard(null)}><GripVertical size={15} /></span>
                  <button className="kb-card-del icon-btn" title="Delete card" onClick={() => removeCard(col.id, card.id)}><X size={13} /></button>
                  <textarea
                    className="kb-card-title" value={card.title} rows={1} placeholder="Write a to-do…"
                    autoFocus={focusCard === card.id}
                    onFocus={() => { if (focusCard === card.id) setFocusCard(null); }}
                    ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                    onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; editCard(col.id, card.id, { title: e.target.value }); }}
                  />
                  {(card.tags || []).length > 0 && (
                    <div className="kb-tags">
                      {card.tags.map((t) => {
                        const c = tagColor(t.color);
                        return (
                          <span key={t.id} className="kb-tag" style={{ background: c.bg, color: c.fg }}>
                            {t.label}
                            <button className="kb-tag-x" title="Remove tag" onClick={() => removeTag(col.id, card.id, t.id)}><X size={11} /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {tagEditFor === card.id ? (
                    <TagComposer onAdd={(label, color) => addTag(col.id, card.id, label, color)} onClose={() => setTagEditFor(null)} />
                  ) : (
                    <button className="kb-tag-add" onClick={() => setTagEditFor(card.id)}><TagIcon size={12} /> Add tag</button>
                  )}
                </div>
              ))}

              <button className="kb-add-card" onClick={() => addCard(col.id)}><Plus size={15} /> New card</button>
            </div>
          </div>
        ))}

        <button className="kb-add-col" onClick={addColumn}><Plus size={16} /> Add list</button>
      </div>

      {total === 0 && <div className="hint" style={{ marginTop: 16 }}>Add a card to a list, then drag it across lists to track progress.</div>}
    </div>
  );
}

/** Inline tag composer: type a label, click a colour to add it. */
function TagComposer({ onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="kb-tagcomposer" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef} className="kb-tag-input" value={label} placeholder="Tag label…"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(label, 'gray'); setLabel(''); } else if (e.key === 'Escape') onClose(); }}
      />
      <div className="kb-swatches">
        {TAG_COLORS.map((c) => (
          <button key={c.key} className="kb-swatch" style={{ background: c.bg, color: c.fg }} title={c.key}
            onClick={() => { onAdd(label, c.key); setLabel(''); }}>A</button>
        ))}
      </div>
      <button className="kb-tag-done icon-btn" title="Done" onClick={onClose}><X size={14} /></button>
    </div>
  );
}
