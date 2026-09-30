// The To-Do board.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { TAG_KEYS, str } from './base.js';

// ---------------------------------------------------------------------------
// To-Do board (a single global Kanban planner: columns → cards → tags)
// ---------------------------------------------------------------------------
export function normalizeBoard(board) {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  return {
    columns: columns.slice(0, 40).map((c) => ({
      id: c?.id || nanoid(8),
      name: str(c?.name, 120),
      cards: (Array.isArray(c?.cards) ? c.cards : []).slice(0, 500).map((card) => ({
        id: card?.id || nanoid(8),
        title: str(card?.title, 4000),
        notes: str(card?.notes, 8000),
        color: TAG_KEYS.has(card?.color) ? card.color : null,
        urgent: !!card?.urgent,
        planId: typeof card?.planId === 'string' && card.planId ? str(card.planId, 40) : null, // the plan it belongs to
        tags: (Array.isArray(card?.tags) ? card.tags : []).slice(0, 20).map((t) => ({
          id: t?.id || nanoid(6),
          label: str(t?.label, 60),
          color: TAG_KEYS.has(t?.color) ? t.color : 'gray',
        })),
      })),
    })),
  };
}
export const DEFAULT_BOARD = () => ({
  columns: [
    { id: nanoid(8), name: 'To do', cards: [] },
    { id: nanoid(8), name: 'In progress', cards: [] },
    { id: nanoid(8), name: 'Done', cards: [] },
  ],
});
