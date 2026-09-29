// Time tracker: entries, the running tracker, Trash, and the Excel export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir } from './helpers.js';
import { seedLegacyLibrary } from './fixtures/legacy-library.js';
import { readCentralDirectory, readEntryBuffer } from '../server/zip.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

test('entries: saved with a plan or a free project, sanitised, edited, deleted to Trash and back', async () => {
  let r = await srv.api('/api/time');
  assert.deepEqual([r.data.entries, r.data.running], [[], null]);
  assert.ok(r.data.activities.includes('Design'));

  r = await srv.api('/api/time/entries', { method: 'POST', json: { date: '2026-08-06', start: '21:30', end: '22:00', planId: 'plan3', activity: 'Design', details: '2 Herbstkarte' } });
  assert.equal(r.status, 201);
  const a = r.data.entry;
  assert.deepEqual([a.date, a.start, a.end, a.planId, a.project, a.activity], ['2026-08-06', '21:30', '22:00', 'plan3', 'Current plan', 'Design']);
  r = await srv.api('/api/time/entries', { method: 'POST', json: { date: '2026-08-06', start: '22:00', end: '00:00', planId: 'nope', project: 'LumaKeys', activity: 'Storyboard' } });
  const b = r.data.entry;
  assert.deepEqual([b.planId, b.project], [null, 'LumaKeys']);
  assert.equal((await srv.api('/api/time/entries', { method: 'POST', json: { date: '2026-13-01', start: '9:00', end: '10:00' } })).status, 400);

  r = await srv.api(`/api/time/entries/${a.id}`, { method: 'PATCH', json: { end: '23:15', start: '99:00', details: 'Two cards' } });
  assert.deepEqual([r.data.entry.start, r.data.entry.end, r.data.entry.details], ['21:30', '23:15', 'Two cards']);

  r = await srv.api(`/api/time/entries/${b.id}`, { method: 'DELETE' });
  const { trashId } = r.data;
  assert.equal((await srv.api('/api/time')).data.entries.length, 1);
  const trash = (await srv.api('/api/trash')).data.items.find((t) => t.trashId === trashId);
  assert.match(trash.title, /2026-08-06 · 22:00–00:00 · Storyboard/);
  await srv.api(`/api/trash/${trashId}/restore`, { method: 'POST' });
  const back = (await srv.api('/api/time')).data.entries;
  assert.deepEqual(back.map((e) => e.id).sort(), [a.id, b.id].sort());
  assert.ok(!('label' in back.find((e) => e.id === b.id)));
  // One plan's entries only.
  assert.deepEqual((await srv.api('/api/time?plan=plan3')).data.entries.map((e) => e.id), [a.id]);
});

test('running tracker: start, change, stop into an entry (the browser gives the local times); short ones and discards save nothing', async () => {
  const startedAt = Date.now() - 45 * 60000;
  let r = await srv.api('/api/time/start', { method: 'POST', json: { planId: 'plan2', activity: 'After Effects', startedAt } });
  assert.deepEqual([r.data.running.planId, r.data.running.activity, r.data.running.startedAt], ['plan2', 'After Effects', startedAt]);
  r = await srv.api('/api/time/running', { method: 'PATCH', json: { details: 'Intro', startedAt: Date.now() + 99999 } });
  assert.deepEqual([r.data.running.details, r.data.running.startedAt], ['Intro', startedAt]);
  r = await srv.api('/api/time/stop', { method: 'POST', json: { date: '2026-08-20', start: '10:00', end: '10:45' } });
  assert.deepEqual([r.data.entry.planId, r.data.entry.activity, r.data.entry.details, r.data.entry.end, r.data.running], ['plan2', 'After Effects', 'Intro', '10:45', null]);
  assert.equal((await srv.api('/api/time/stop', { method: 'POST', json: {} })).status, 409);
  // Under a minute: nothing saved.
  await srv.api('/api/time/start', { method: 'POST', json: { activity: 'Admin' } });
  r = await srv.api('/api/time/stop', { method: 'POST', json: { date: '2026-08-20', start: '11:00', end: '11:00' } });
  assert.equal(r.data.entry, null);
  // Own activities, deduplicated.
  r = await srv.api('/api/time/activities', { method: 'PUT', json: { activities: ['Design', 'design', ' Colour grading ', ''] } });
  assert.deepEqual(r.data.activities, ['Design', 'Colour grading']);
});

test('pause: the time paused is left out — the entry ends that much earlier and keeps the pause’s length', async () => {
  const min = 60000;
  let r = await srv.api('/api/time/start', { method: 'POST', json: { activity: 'Design', startedAt: Date.now() - 45 * min } });
  assert.deepEqual([r.data.running.pausedAt, r.data.running.pauses], [0, []]);
  // A pause since 25 min ago (pressed late), then on again.
  r = await srv.api('/api/time/pause', { method: 'POST', json: { at: Date.now() - 25 * min } });
  assert.ok(Math.abs(r.data.running.pausedAt - (Date.now() - 25 * min)) < 5000);
  r = await srv.api('/api/time/pause', { method: 'POST', json: {} }); // pressing it again keeps its start
  assert.ok(Math.abs(r.data.running.pausedAt - (Date.now() - 25 * min)) < 5000);
  r = await srv.api('/api/time/resume', { method: 'POST' });
  assert.equal(r.data.running.pausedAt, 0);
  assert.equal(r.data.running.pauses.length, 1);
  assert.ok(Math.abs(r.data.running.pauses[0].to - r.data.running.pauses[0].from - 25 * min) < 5000);
  // A pause can't start before the one before ended, nor before the start.
  r = await srv.api('/api/time/pause', { method: 'POST', json: { at: Date.now() - 60 * min } });
  assert.equal(r.data.running.pausedAt, r.data.running.pauses[0].to);
  r = await srv.api('/api/time/resume', { method: 'POST' });
  // Stopped: 45 min in all, ~25 paused → the entry gets the pause's minutes.
  r = await srv.api('/api/time/stop', { method: 'POST', json: { date: '2026-07-21', start: '10:00', end: '10:20' } });
  assert.deepEqual([r.data.entry.start, r.data.entry.end], ['10:00', '10:20']);
  assert.ok([25, 26].includes(r.data.entry.pause), String(r.data.entry.pause));
  // Worked under a minute (the rest was a pause): nothing saved.
  await srv.api('/api/time/start', { method: 'POST', json: { startedAt: Date.now() - 90000 } });
  await srv.api('/api/time/pause', { method: 'POST', json: { at: Date.now() - 60000 } });
  r = await srv.api('/api/time/stop', { method: 'POST', json: { date: '2026-07-21', start: '11:00', end: '11:00' } });
  assert.equal(r.data.entry, null);
  // Nothing running: 409; an older entry reads with no pause.
  assert.equal((await srv.api('/api/time/pause', { method: 'POST' })).status, 409);
  assert.ok((await srv.api('/api/time')).data.entries.filter((e) => e.date !== '2026-07-21').every((e) => e.pause === 0));
});

test('export: an .xlsx with the log (filters, frozen header, drop-downs, duration formulas), a summary and a hidden list sheet', async () => {
  const res = await fetch(`${srv.base}/api/time/export.xlsx?from=2026-08-01&to=2026-08-31&lang=de`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml/);
  assert.match(res.headers.get('content-disposition'), /Zeiterfassung_2026-08-01_2026-08-31\.xlsx/);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(srv.dataDir, 'test-export.xlsx');
  await fsp.writeFile(file, buf);
  const fh = await fsp.open(file, 'r');
  try {
    const entries = await readCentralDirectory(fh, buf.length);
    const names = entries.map((e) => e.name);
    for (const n of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) assert.ok(names.includes(n), n);
    const read = async (n) => (await readEntryBuffer(fh, entries.find((e) => e.name === n))).toString('utf8');
    const book = await read('xl/workbook.xml');
    assert.match(book, /<sheet name="Zeiterfassung" sheetId="1" r:id="rId1"\/>/);
    assert.match(book, /<sheet name="Listen" sheetId="3" state="hidden"/);
    const log = await read('xl/worksheets/sheet1.xml');
    for (const h of ['Datum', 'Startzeit', 'Endzeit', 'Dauer (h)', 'Kunde', 'Projekt', 'Tätigkeit', 'Details &amp; Ergebnisse']) assert.ok(log.includes(`<t xml:space="preserve">${h}</t>`), h);
    assert.ok(!log.includes('>Betrag<')); // no project has a rate yet
    assert.match(log, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
    assert.match(log, /<autoFilter ref="A1:H4"\/>/); // header + 3 August entries
    assert.match(log, /<f>ROUND\(MOD\(C2-B2,1\)\*24,2\)<\/f><v>1.75<\/v>/); // 21:30–23:15
    assert.match(log, /<f>ROUND\(MOD\(C3-B3,1\)\*24,2\)<\/f><v>2<\/v>/); // 22:00–00:00 over midnight
    assert.match(log, /<f>SUBTOTAL\(109,D2:D4\)<\/f><v>4.5<\/v>/);
    assert.match(log, /<dataValidation type="list"[^>]*sqref="F2:F503"><formula1>Listen!\$B\$1:\$B\$\d+<\/formula1>/);
    assert.match(log, /<dataValidation type="list"[^>]*sqref="G2:G503"><formula1>Listen!\$C\$1:\$C\$\d+<\/formula1>/);
    assert.match(log, /<c r="A2" s="2"><v>46240<\/v><\/c>/); // 2026-08-06 as an Excel date
    const summary = await read('xl/worksheets/sheet2.xml');
    assert.match(summary, /Nach Kunde/);
    assert.match(summary, /Nach Projekt/);
    assert.match(summary, /SUMIFS\('Zeiterfassung'!\$D\$2:\$D\$4,'Zeiterfassung'!\$F\$2:\$F\$4,&quot;Current plan&quot;\)/);
  } finally { await fh.close(); }

  // A project with an hourly rate: Rate + Amount columns and their total.
  await srv.api('/api/plans/plan3', { method: 'PATCH', json: { rate: 80 } });
  const res2 = await fetch(`${srv.base}/api/time/export.xlsx?from=2026-08-01&to=2026-08-31&lang=de`);
  const buf2 = Buffer.from(await res2.arrayBuffer());
  const file2 = path.join(srv.dataDir, 'test-export2.xlsx');
  await fsp.writeFile(file2, buf2);
  const fh2 = await fsp.open(file2, 'r');
  try {
    const entries = await readCentralDirectory(fh2, buf2.length);
    const log = (await readEntryBuffer(fh2, entries.find((e) => e.name === 'xl/worksheets/sheet1.xml'))).toString('utf8');
    assert.ok(log.includes('<t xml:space="preserve">Betrag</t>'));
    assert.match(log, /<autoFilter ref="A1:J4"\/>/);
    assert.match(log, /<f>IF\(I2=&quot;&quot;,&quot;&quot;,ROUND\(D2\*I2,2\)\)<\/f><v>140<\/v>/); // 1.75 h × 80
    assert.match(log, /<f>SUBTOTAL\(109,J2:J4\)<\/f><v>140<\/v>/);
    const styles = (await readEntryBuffer(fh2, entries.find((e) => e.name === 'xl/styles.xml'))).toString('utf8');
    assert.ok(styles.includes('formatCode="#,##0.00 &quot;€&quot;"'));
  } finally { await fh2.close(); }
  // English, classic look, one project only.
  const en = await fetch(`${srv.base}/api/time/export.xlsx?lang=en&style=classic&plan=plan2`);
  assert.match(en.headers.get('content-disposition'), /time-log_Mid-plan\.xlsx/);

  // One project's export: its drop-downs offer only that project and the activities done on it.
  const one = await fetch(`${srv.base}/api/time/export.xlsx?plan=plan3&lang=de`);
  assert.match(one.headers.get('content-disposition'), /Zeiterfassung_Current-plan\.xlsx/);
  const buf3 = Buffer.from(await one.arrayBuffer());
  const file3 = path.join(srv.dataDir, 'test-export3.xlsx');
  await fsp.writeFile(file3, buf3);
  const fh3 = await fsp.open(file3, 'r');
  try {
    const entries = await readCentralDirectory(fh3, buf3.length);
    const read = async (n) => (await readEntryBuffer(fh3, entries.find((e) => e.name === n))).toString('utf8');
    const lists = await read('xl/worksheets/sheet3.xml');
    for (const v of ['Current plan', 'Design']) assert.ok(lists.includes(`>${v}<`), v);
    for (const v of ['Mid plan', 'LumaKeys', 'Storyboard', 'After Effects', 'Animation', 'Website']) assert.ok(!lists.includes(`>${v}<`), v);
    const log = await read('xl/worksheets/sheet1.xml');
    assert.match(log, /sqref="F2:F\d+"><formula1>Listen!\$B\$1:\$B\$1<\/formula1>/); // one project
    assert.match(log, /sqref="G2:G\d+"><formula1>Listen!\$C\$1:\$C\$1<\/formula1>/); // one activity
    assert.match(await read('xl/worksheets/sheet2.xml'), /Projekt: Current plan/);
  } finally { await fh3.close(); }
});
