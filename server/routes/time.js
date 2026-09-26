// Time tracker: entries (date, from–to, a plan or a free project / client,
// activity, details), the one running now, the activity list, and the export
// as an Excel workbook (.xlsx).
import { nanoid } from 'nanoid';
import { readDB, mutateDB } from '../db.js';
import {
  str, normalizeTimeEntry, normalizeTimeTracker, isDay, isTimeOfDay, entryMinutes,
} from '../schema.js';
import { createRouter } from '../http.js';
import { buildXlsx, excelDate, excelTime } from '../xlsx.js';

const router = createRouter();
export default router;

/** How a plan shows as project / client: "Client · Plan" (or just the plan). */
export const planLabel = (p) => (p ? (p.client ? `${p.client} · ${p.name || 'Plan'}` : p.name || 'Plan') : '');
const labelOf = (db, e) => planLabel(db.plans.find((p) => p.id === e.planId)) || e.project || '';
const sorted = (list) => [...list].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));

router.get('/api/time', async (_req, res) => {
  const db = await readDB();
  res.json({ entries: sorted(db.timeEntries.map(normalizeTimeEntry)), ...db.timeTracker });
});

// Only what the body brings (and makes sense) changes.
function applyEntry(db, e, body) {
  if (isDay(body.date)) e.date = body.date;
  if (isTimeOfDay(body.start)) e.start = body.start;
  if (isTimeOfDay(body.end)) e.end = body.end;
  if ('planId' in body) e.planId = typeof body.planId === 'string' && db.plans.some((p) => p.id === body.planId) ? body.planId : null;
  if ('project' in body) e.project = str(body.project, 160);
  if (e.planId) e.project = planLabel(db.plans.find((p) => p.id === e.planId)); // the name as it was, should the plan go
  if ('activity' in body) e.activity = str(body.activity, 60);
  if ('details' in body) e.details = str(body.details, 2000);
  e.updatedAt = Date.now();
  return e;
}

router.post('/api/time/entries', async (req, res) => {
  const b = req.body || {};
  if (!isDay(b.date) || !isTimeOfDay(b.start) || !isTimeOfDay(b.end)) return res.status(400).json({ error: 'invalid_time', message: 'A date, a start and an end time are needed.' });
  const entry = await mutateDB((db) => {
    const e = applyEntry(db, normalizeTimeEntry({ id: nanoid(10), createdAt: Date.now() }), b);
    db.timeEntries.push(e);
    return e;
  });
  res.status(201).json({ entry });
});

router.patch('/api/time/entries/:id', async (req, res) => {
  const entry = await mutateDB((db) => {
    const i = db.timeEntries.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    db.timeEntries[i] = applyEntry(db, normalizeTimeEntry(db.timeEntries[i]), req.body || {});
    return db.timeEntries[i];
  });
  if (!entry) return res.status(404).json({ error: 'not_found' });
  res.json({ entry });
});

// Deleting an entry puts it in the Trash (restorable, and Undo in the page).
router.delete('/api/time/entries/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const i = db.timeEntries.findIndex((x) => x.id === req.params.id);
    if (i === -1) return false;
    const [e] = db.timeEntries.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'timeEntry', deletedAt: Date.now(), data: { ...e, label: labelOf(db, e) } });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ trashId });
});

// ---- The running tracker (one at a time). Times of day come from the browser (its time zone).
router.post('/api/time/start', async (req, res) => {
  const b = req.body || {};
  const tracker = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    t.running = normalizeTimeTracker({ running: {
      startedAt: Number.isFinite(b.startedAt) && b.startedAt <= Date.now() + 60000 ? b.startedAt : Date.now(),
      planId: db.plans.some((p) => p.id === b.planId) ? b.planId : null, project: b.project, activity: b.activity, details: b.details,
    } }).running;
    db.timeTracker = t;
    return t;
  });
  res.json(tracker);
});

// Change what's running (project, activity, details, or when it started).
router.patch('/api/time/running', async (req, res) => {
  const b = req.body || {};
  const tracker = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    if (!t.running) return null;
    const r = { ...t.running };
    if ('planId' in b) r.planId = db.plans.some((p) => p.id === b.planId) ? b.planId : null;
    for (const k of ['project', 'activity', 'details']) if (k in b) r[k] = b[k];
    if (Number.isFinite(b.startedAt) && b.startedAt <= Date.now()) r.startedAt = b.startedAt;
    t.running = normalizeTimeTracker({ running: r }).running;
    db.timeTracker = t;
    return t;
  });
  if (!tracker) return res.status(409).json({ error: 'not_running' });
  res.json(tracker);
});

// Stop → an entry (the browser says the local date and times). Under a minute: nothing saved.
router.post('/api/time/stop', async (req, res) => {
  const b = req.body || {};
  const out = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    if (!t.running) return null;
    const r = t.running;
    let entry = null;
    if (!b.discard && isDay(b.date) && isTimeOfDay(b.start) && isTimeOfDay(b.end) && Date.now() - r.startedAt >= 60000) {
      entry = applyEntry(db, normalizeTimeEntry({ id: nanoid(10), createdAt: Date.now() }), {
        date: b.date, start: b.start, end: b.end, planId: r.planId, project: r.project, activity: r.activity, details: 'details' in b ? b.details : r.details,
      });
      db.timeEntries.push(entry);
    }
    t.running = null;
    db.timeTracker = t;
    return { entry, ...t };
  });
  if (!out) return res.status(409).json({ error: 'not_running' });
  res.json(out);
});

router.put('/api/time/activities', async (req, res) => {
  const tracker = await mutateDB((db) => {
    db.timeTracker = normalizeTimeTracker({ ...db.timeTracker, activities: Array.isArray(req.body?.activities) ? req.body.activities : [] });
    return db.timeTracker;
  });
  res.json(tracker);
});

// ---- Export --------------------------------------------------------------------
const WORDS = {
  de: {
    log: 'Zeiterfassung', summary: 'Übersicht', lists: 'Listen',
    head: ['Datum', 'Startzeit', 'Endzeit', 'Dauer (h)', 'Projekt/Kunde', 'Tätigkeit', 'Details & Ergebnisse'],
    total: 'Summe', byProject: 'Nach Projekt/Kunde', byActivity: 'Nach Tätigkeit', byMonth: 'Nach Monat', hours: 'Stunden', entries: 'Einträge',
    period: 'Zeitraum', all: 'alle Einträge', file: 'Zeiterfassung', none: '(ohne)',
  },
  en: {
    log: 'Time log', summary: 'Summary', lists: 'Lists',
    head: ['Date', 'Start', 'End', 'Duration (h)', 'Project / client', 'Activity', 'Details & results'],
    total: 'Total', byProject: 'By project / client', byActivity: 'By activity', byMonth: 'By month', hours: 'Hours', entries: 'Entries',
    period: 'Period', all: 'all entries', file: 'time-log', none: '(none)',
  },
};
// Header colours: the app's own (near-black, teal line) or a classic office blue.
const LOOK = { app: { head: '1B1B1E', line: '2EC5D3', band: 'EAF8FA', tab: '2EC5D3' }, classic: { head: '2F5597', line: '1F3864', band: 'DDE6F3', tab: '2F5597' } };
function styles(look) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>'
    + '<fonts count="5">'
    + '<font><sz val="11"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>'
    + '<font><b/><sz val="15"/><color rgb="FF1F1F1F"/><name val="Calibri"/><family val="2"/></font>'
    + '<font><sz val="10"/><color rgb="FF7A7A7A"/><name val="Calibri"/><family val="2"/></font>'
    + '</fonts>'
    + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + `<fill><patternFill patternType="solid"><fgColor rgb="FF${look.head}"/><bgColor indexed="64"/></patternFill></fill>`
    + `<fill><patternFill patternType="solid"><fgColor rgb="FF${look.band}"/><bgColor indexed="64"/></patternFill></fill></fills>`
    + '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + `<border><left/><right/><top/><bottom style="medium"><color rgb="FF${look.line}"/></bottom><diagonal/></border>`
    + `<border><left/><right/><top style="thin"><color rgb="FF${look.line}"/></top><bottom/><diagonal/></border></borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="11">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>'                                   // 0 text
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' // 1 header
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 2 date
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 3 time
    + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 4 hours
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'                  // 5 wrapped text
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' // 6 total label
    + '<xf numFmtId="166" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 7 total hours
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                                                          // 8 title
    + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                                                          // 9 muted
    + '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 10 count
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
const hours = (min) => Math.round((min / 60) * 100) / 100;
const quoteSheet = (n) => `'${n.replace(/'/g, "''")}'`;

/** The export as { buffer, filename } for the entries that match the filters. */
export function timeWorkbook(db, q = {}) {
  const w = WORDS[q.lang === 'en' ? 'en' : 'de'];
  const look = LOOK[q.style === 'classic' ? 'classic' : 'app'];
  const from = isDay(q.from) ? q.from : null; const to = isDay(q.to) ? q.to : null;
  const rows = db.timeEntries.map(normalizeTimeEntry)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .filter((e) => !q.plan || (q.plan === 'none' ? !e.planId : e.planId === q.plan))
    .filter((e) => !q.activity || e.activity === q.activity)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e) => ({ ...e, label: labelOf(db, e), min: entryMinutes(e) }));
  const n = rows.length;
  const log = [w.head.map((v) => ({ v, s: 1 }))];
  rows.forEach((e, i) => {
    const r = i + 2;
    log.push([
      { v: excelDate(e.date), s: 2 }, { v: excelTime(e.start), s: 3 }, { v: excelTime(e.end), s: 3 },
      { f: `ROUND(MOD(C${r}-B${r},1)*24,2)`, v: hours(e.min), s: 4 },
      { v: e.label, s: 0 }, { v: e.activity, s: 0 }, { v: e.details, s: 5 },
    ]);
  });
  const total = rows.reduce((m, e) => m + e.min, 0);
  // The total counts only what the filter buttons leave visible (SUBTOTAL 109).
  log.push([{ v: w.total, s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { f: n ? `SUBTOTAL(109,D2:D${n + 1})` : '0', v: hours(total), s: 7 }, { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }]);

  // Drop-down lists (like the example): every plan and project used, and the activities.
  const labels = [...new Set([...db.plans.filter((p) => p.status !== 'archived').map(planLabel), ...rows.map((e) => e.label)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const acts = [...new Set([...normalizeTimeTracker(db.timeTracker).activities, ...rows.map((e) => e.activity)].filter(Boolean))];
  const listRows = Array.from({ length: Math.max(labels.length, acts.length) }, (_, i) => [labels[i] ?? '', acts[i] ?? '']);
  const upto = n + 500; // new rows typed into the sheet get the lists too
  const lists = [
    ...(labels.length ? [{ sqref: `E2:E${upto}`, source: `${w.lists}!$A$1:$A$${labels.length}` }] : []),
    ...(acts.length ? [{ sqref: `F2:F${upto}`, source: `${w.lists}!$B$1:$B$${acts.length}` }] : []),
  ];

  // Summary: hours by project / client, by activity (live formulas on the log), by month.
  const L = quoteSheet(w.log);
  const sum = (key) => { const m = new Map(); for (const e of rows) m.set(e[key] || w.none, (m.get(e[key] || w.none) || 0) + e.min); return [...m].sort((a, b) => b[1] - a[1]); };
  const months = new Map(); for (const e of rows) months.set(e.date.slice(0, 7), (months.get(e.date.slice(0, 7)) || 0) + e.min);
  const period = from || to ? `${from || '…'} – ${to || '…'}` : w.all;
  const summary = [[{ v: w.log, s: 8 }], [{ v: `${w.period}: ${period} · ${n} ${w.entries}`, s: 9 }], []];
  const block = (title, pairs, col, formula) => {
    summary.push([{ v: title, s: 1 }, { v: w.hours, s: 1 }, { v: w.entries, s: 1 }]);
    const first = summary.length + 1;
    for (const [k, min] of pairs) {
      const r = summary.length + 1;
      const count = rows.filter((e) => (e[col] || w.none) === k).length;
      summary.push([{ v: k, s: 0 },
        formula && k !== w.none ? { f: `SUMIF(${L}!$${formula}$2:$${formula}$${n + 1},A${r},${L}!$D$2:$D$${n + 1})`, v: hours(min), s: 4 } : { v: hours(min), s: 4 },
        formula && k !== w.none ? { f: `COUNTIF(${L}!$${formula}$2:$${formula}$${n + 1},A${r})`, v: count, s: 10 } : { v: count, s: 10 }]);
    }
    const last = summary.length;
    summary.push([{ v: w.total, s: 6 }, { f: pairs.length ? `SUM(B${first}:B${last})` : '0', v: hours(pairs.reduce((m, p) => m + p[1], 0)), s: 7 }, { f: pairs.length ? `SUM(C${first}:C${last})` : '0', v: pairs.reduce((m, [k]) => m + rows.filter((e) => (e[col] || w.none) === k).length, 0), s: 7 }]);
    summary.push([]);
  };
  block(w.byProject, sum('label'), 'label', 'E');
  block(w.byActivity, sum('activity'), 'activity', 'F');
  summary.push([{ v: w.byMonth, s: 1 }, { v: w.hours, s: 1 }, { v: w.entries, s: 1 }]);
  for (const [m, min] of [...months].sort()) summary.push([{ v: m, s: 0 }, { v: hours(min), s: 4 }, { v: rows.filter((e) => e.date.startsWith(m)).length, s: 10 }]);

  const buffer = buildXlsx({
    stylesXml: styles(look),
    sheets: [
      { name: w.log, rows: log, cols: [12, 10, 10, 11, 34, 18, 52], freeze: true, autoFilter: `A1:G${n + 1}`, lists, tabSelected: true, tab: look.tab, headerHeight: 24 },
      { name: w.summary, rows: summary, cols: [36, 12, 10], grid: false },
      { name: w.lists, rows: listRows, cols: [40, 24], hidden: true },
    ],
  });
  const span = from || to ? `_${from || 'start'}_${to || 'today'}` : '';
  return { buffer, filename: `${w.file}${span}.xlsx` };
}

router.get('/api/time/export.xlsx', async (req, res) => {
  const db = await readDB();
  const { buffer, filename } = timeWorkbook(db, req.query);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});
