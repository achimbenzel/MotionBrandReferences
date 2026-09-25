// To-Do board (a single global Kanban planner: columns → cards → tags).
import { nanoid } from 'nanoid';
import { readDB, mutateDB } from '../db.js';
import { normalizeBoard, DEFAULT_BOARD, str } from '../schema.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

router.get('/api/board', async (_req, res) => {
  const db = await readDB();
  if (!db.board || !Array.isArray(db.board.columns) || !db.board.columns.length) {
    const board = DEFAULT_BOARD();
    await mutateDB((d) => { d.board = board; });
    return res.json({ board });
  }
  res.json({ board: normalizeBoard(db.board) });
});

router.put('/api/board', async (req, res) => {
  if (!Array.isArray(req.body?.columns)) return res.status(400).json({ error: 'columns_required' });
  const board = normalizeBoard({ columns: req.body.columns });
  await mutateDB((d) => { d.board = board; });
  res.json({ board });
});

// Single-card changes (used by a plan's to-do list), so a plan page never
// sends — and can't overwrite — the whole board.
const currentBoard = (d) => (d.board && Array.isArray(d.board.columns) && d.board.columns.length ? normalizeBoard(d.board) : DEFAULT_BOARD());

// Add a card to a list (default: the first), optionally linked to a plan.
router.post('/api/board/cards', async (req, res) => {
  const board = await mutateDB((d) => {
    const b = currentBoard(d);
    const col = b.columns.find((c) => c.id === req.body.columnId) || b.columns[0];
    col.cards.push({
      id: nanoid(8), title: str(req.body.title, 4000), notes: '', color: null, urgent: !!req.body.urgent, tags: [],
      planId: req.body.planId ? str(req.body.planId, 40) : null,
    });
    d.board = b;
    return b;
  });
  res.status(201).json({ board });
});

// Retitle, flag, link / unlink, or move a card to another list (at its end).
router.patch('/api/board/cards/:id', async (req, res) => {
  const board = await mutateDB((d) => {
    const b = currentBoard(d);
    const from = b.columns.find((c) => c.cards.some((k) => k.id === req.params.id));
    if (!from) return null;
    const i = from.cards.findIndex((k) => k.id === req.params.id);
    const card = from.cards[i];
    if ('title' in req.body) card.title = str(req.body.title, 4000);
    if ('urgent' in req.body) card.urgent = !!req.body.urgent;
    if ('planId' in req.body) card.planId = req.body.planId ? str(req.body.planId, 40) : null;
    const to = req.body.columnId && req.body.columnId !== from.id ? b.columns.find((c) => c.id === req.body.columnId) : null;
    if (to) { from.cards.splice(i, 1); to.cards.push(card); }
    d.board = b;
    return b;
  });
  if (!board) return res.status(404).json({ error: 'not_found' });
  res.json({ board });
});
