// Two devices on one library: an edit based on something the other device has
// changed since is refused (409) instead of overwriting it; "keep mine" forces
// it; your own edits in a row, and edits to different blocks, never clash; and
// open pages hear about every change.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const as = (who, extra = {}) => ({ 'X-Client-Id': `tab-${who}-000`, ...extra });
async function load(path, who) {
  const r = await srv.api(path, { headers: as(who) });
  return { data: r.data, base: r.headers.get('x-rev') };
}
const patch = (path, who, base, json, extra = {}) => srv.api(path, { method: 'PATCH', json, headers: as(who, { ...(base ? { 'X-Base-Rev': base } : {}), ...extra }) });

test('an edit on a stale copy is refused; keep mine overwrites; a fresh load goes through', async () => {
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Shared' } })).data.plan;
  const phone = await load(`/api/plans/${plan.id}`, 'phone');
  const desk = await load(`/api/plans/${plan.id}`, 'desk');
  assert.ok(Number(desk.base) > 0);

  assert.equal((await patch(`/api/plans/${plan.id}`, 'desk', desk.base, { name: 'Desk name' })).status, 200);
  // The phone still shows the old copy: its edit would overwrite the desk's.
  const stale = await patch(`/api/plans/${plan.id}`, 'phone', phone.base, { name: 'Phone name' });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, 'conflict');
  assert.equal((await srv.api(`/api/plans/${plan.id}`)).data.plan.name, 'Desk name');
  // "Keep mine"
  assert.equal((await patch(`/api/plans/${plan.id}`, 'phone', phone.base, { name: 'Phone name' }, { 'X-Force': '1' })).status, 200);
  assert.equal((await srv.api(`/api/plans/${plan.id}`)).data.plan.name, 'Phone name');
  // …now the desk's copy is the stale one; after loading again it saves fine.
  assert.equal((await patch(`/api/plans/${plan.id}`, 'desk', desk.base, { name: 'Desk again' })).status, 409);
  const fresh = await load(`/api/plans/${plan.id}`, 'desk');
  assert.equal((await patch(`/api/plans/${plan.id}`, 'desk', fresh.base, { name: 'Desk again' })).status, 200);
});

test('your own edits in a row, other blocks and requests without a base never clash', async () => {
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Blocks' } })).data.plan;
  const a = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text' } })).data.block;
  const b = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text' } })).data.block;
  const desk = await load(`/api/plans/${plan.id}`, 'desk');
  const phone = await load(`/api/plans/${plan.id}`, 'phone');
  // Typing: many saves on the same (old) base from the same tab.
  for (const text of ['H', 'He', 'Hello']) {
    assert.equal((await patch(`/api/plans/${plan.id}/blocks/${a.id}`, 'desk', desk.base, { content: text })).status, 200);
  }
  // The phone edits another block of the same plan: no clash.
  assert.equal((await patch(`/api/plans/${plan.id}/blocks/${b.id}`, 'phone', phone.base, { content: 'Phone' })).status, 200);
  // …but not the block the desk just changed.
  assert.equal((await patch(`/api/plans/${plan.id}/blocks/${a.id}`, 'phone', phone.base, { content: 'Oops' })).status, 409);
  // Different fields of the same thing don't clash (the desk only changed the text).
  assert.equal((await patch(`/api/plans/${plan.id}/blocks/${a.id}`, 'phone', phone.base, { collapsed: true })).status, 200);
  assert.equal((await patch(`/api/plans/${plan.id}`, 'phone', phone.base, { status: 'concept' })).status, 200);
  // Ticking one to-do (from the dashboard) never clashes — but a stale page that
  // would save the whole list over it does.
  const todos = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'todos' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${todos.id}`, { method: 'PATCH', json: { items: [{ id: 't1', text: 'One', done: false }] } });
  const page = await load(`/api/plans/${plan.id}`, 'phone');
  const tick = await srv.api(`/api/plans/${plan.id}/blocks/${todos.id}/items/t1`, { method: 'PATCH', json: { done: true }, headers: as('dash', { 'X-Base-Rev': '1' }) });
  assert.equal(tick.status, 200);
  assert.equal((await patch(`/api/plans/${plan.id}/blocks/${todos.id}`, 'phone', page.base, { items: [{ id: 't1', text: 'One!', done: false }] })).status, 409);
  // Old clients that send no base are taken as before.
  assert.equal((await srv.api(`/api/plans/${plan.id}/blocks/${a.id}`, { method: 'PATCH', json: { content: 'Legacy' } })).status, 200);
  const blocks = (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks;
  assert.deepEqual(blocks.slice(0, 2).map((x) => x.content), ['Legacy', 'Phone']);
});

test('the same for notes, software and the board', async () => {
  const note = (await srv.api('/api/notes', { method: 'POST', json: { title: 'N' } })).data.note;
  const n1 = await load(`/api/notes/${note.id}`, 'phone');
  assert.equal((await patch(`/api/notes/${note.id}`, 'desk', n1.base, { body: 'desk' })).status, 200);
  assert.equal((await patch(`/api/notes/${note.id}`, 'phone', n1.base, { body: 'phone' })).status, 409);

  const sw = (await srv.api('/api/software', { method: 'POST', json: { name: 'AE' } })).data.software;
  const s1 = await load(`/api/software/${sw.id}`, 'phone');
  assert.equal((await patch(`/api/software/${sw.id}`, 'desk', s1.base, { name: 'After Effects' })).status, 200);
  assert.equal((await patch(`/api/software/${sw.id}`, 'phone', s1.base, { name: 'AE 2026' })).status, 409);

  // The board is saved as a whole when cards are dragged: a stale copy must
  // not wipe a card another device renamed meanwhile.
  await srv.api('/api/board');
  const created = (await srv.api('/api/board/cards', { method: 'POST', json: { title: 'Card' } })).data.board;
  const card = created.columns.flatMap((c) => c.cards).find((k) => k.title === 'Card');
  const phone = await load('/api/board', 'phone');
  assert.equal((await patch(`/api/board/cards/${card.id}`, 'desk', phone.base, { title: 'Renamed on the desk' })).status, 200);
  const put = await srv.api('/api/board', { method: 'PUT', json: phone.data.board, headers: as('phone', { 'X-Base-Rev': phone.base }) });
  assert.equal(put.status, 409);
  const now = (await srv.api('/api/board')).data.board.columns.flatMap((c) => c.cards);
  assert.ok(now.some((k) => k.title === 'Renamed on the desk'));
});

test('open pages hear about every change, with who made it', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${srv.base}/api/events`, { signal: ctrl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const next = async () => {
    for (;;) {
      const i = buf.indexOf('\n\n');
      if (i >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find((l) => l.startsWith('data: ')); if (line) return JSON.parse(line.slice(6)); continue; }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buf += dec.decode(value, { stream: true });
    }
  };
  assert.equal((await next()).hello, true);
  const note = (await srv.api('/api/notes', { method: 'POST', json: { title: 'Live' }, headers: as('phone') })).data.note;
  const created = await next();
  assert.equal(created.by, 'tab-phone-000');
  await srv.api(`/api/notes/${note.id}`, { method: 'PATCH', json: { text: 'x' }, headers: as('desk') });
  const edited = await next();
  assert.deepEqual([edited.by, edited.key], ['tab-desk-000', `notes/${note.id}`]);
  assert.ok(edited.rev > created.rev);
  ctrl.abort();
});
