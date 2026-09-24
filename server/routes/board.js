// To-Do board (a single global Kanban planner: columns → cards → tags).
import { readDB, mutateDB } from '../db.js';
import { normalizeBoard, DEFAULT_BOARD } from '../schema.js';
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
