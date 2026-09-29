// Time tracker: entries (date, from–to, a project — or a client, or a free
// project name — activity, details), the one running now, the activity list,
// and the export as an Excel workbook (.xlsx).
import { nanoid } from 'nanoid';
import { readDB, mutateDB } from '../db.js';
import {
  str, normalizeTimeEntry, normalizeTimeTracker, isDay, isTimeOfDay, entryMinutes, pausedMs,
} from '../schema.js';
import { createRouter } from '../http.js';
import { buildXlsx, excelDate, excelTime } from '../xlsx.js';

const router = createRouter();
export default router;

/** How a project shows: "Client · Project" (or just the project). */
export const planLabel = (p) => (p ? (p.client ? `${p.client} · ${p.name || 'Project'}` : p.name || 'Project') : '');
/** Who an entry is for → { plan, client, project } (the project's client, or the entry's own). */
export function whoOf(db, e) {
  const plan = e.planId ? db.plans.find((p) => p.id === e.planId) || null : null;
  const clientId = plan ? plan.clientId : e.clientId;
  const client = clientId ? (db.clients || []).find((c) => c.id === clientId) || null : null;
  return { plan, client, project: plan ? plan.name || 'Project' : e.project || '' };
}
const labelOf = (db, e) => {
  const { plan, client, project } = whoOf(db, e);
  if (plan) return planLabel(plan);
  return client ? (project ? `${client.name} · ${project}` : client.name) : project;
};
const sorted = (list) => [...list].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
const forClient = (db, e, id) => (id === 'none' ? !whoOf(db, e).client : whoOf(db, e).client?.id === id);

router.get('/api/time', async (req, res) => {
  const db = await readDB();
  let entries = db.timeEntries.map(normalizeTimeEntry);
  if (req.query.plan) entries = entries.filter((e) => e.planId === req.query.plan); // one project's entries
  if (req.query.client) entries = entries.filter((e) => forClient(db, e, String(req.query.client))); // …or one client's
  res.json({ entries: sorted(entries), ...db.timeTracker });
});

// Only what the body brings (and makes sense) changes.
function applyEntry(db, e, body) {
  if (isDay(body.date)) e.date = body.date;
  if (isTimeOfDay(body.start)) e.start = body.start;
  if (isTimeOfDay(body.end)) e.end = body.end;
  if ('planId' in body) e.planId = typeof body.planId === 'string' && db.plans.some((p) => p.id === body.planId) ? body.planId : null;
  if ('clientId' in body) e.clientId = typeof body.clientId === 'string' && (db.clients || []).some((c) => c.id === body.clientId) ? body.clientId : null;
  if ('project' in body) e.project = str(body.project, 160);
  if (e.planId) {
    e.clientId = null; // a project's time is its client's
    e.project = planLabel(db.plans.find((p) => p.id === e.planId)); // the name as it was, should the project go
  }
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
      planId: db.plans.some((p) => p.id === b.planId) ? b.planId : null,
      clientId: !b.planId && (db.clients || []).some((c) => c.id === b.clientId) ? b.clientId : null,
      project: b.project, activity: b.activity, details: b.details,
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
    if ('clientId' in b) r.clientId = (db.clients || []).some((c) => c.id === b.clientId) ? b.clientId : null;
    if (r.planId) r.clientId = null;
    for (const k of ['project', 'activity', 'details']) if (k in b) r[k] = b[k];
    if (Number.isFinite(b.startedAt) && b.startedAt <= Date.now()) r.startedAt = b.startedAt;
    if (r.pausedAt && r.pausedAt < r.startedAt) r.pausedAt = r.startedAt; // a pause can't begin before it started
    t.running = normalizeTimeTracker({ running: r }).running;
    db.timeTracker = t;
    return t;
  });
  if (!tracker) return res.status(409).json({ error: 'not_running' });
  res.json(tracker);
});

// Pause and go on: the time paused doesn't count (the entry ends that much earlier).
// `at`: when the pause began, if not now (forgot to press it) — also to move a running pause's start.
router.post('/api/time/pause', async (req, res) => {
  const at = req.body?.at;
  const tracker = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    if (!t.running) return null;
    const r = t.running;
    const now = Date.now();
    const lastEnd = r.pauses.length ? r.pauses[r.pauses.length - 1].to : r.startedAt; // not into the pause before
    if (Number.isFinite(at)) r.pausedAt = Math.min(now, Math.max(lastEnd, r.startedAt, Math.round(at)));
    else if (!r.pausedAt) r.pausedAt = now;
    db.timeTracker = t;
    return t;
  });
  if (!tracker) return res.status(409).json({ error: 'not_running' });
  res.json(tracker);
});

router.post('/api/time/resume', async (_req, res) => {
  const tracker = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    if (!t.running) return null;
    const r = t.running;
    if (r.pausedAt) {
      const now = Date.now();
      if (now - r.pausedAt >= 1000) r.pauses = [...r.pauses, { from: r.pausedAt, to: now }].slice(-200);
      r.pausedAt = 0;
    }
    db.timeTracker = t;
    return t;
  });
  if (!tracker) return res.status(409).json({ error: 'not_running' });
  res.json(tracker);
});

// Stop → an entry (the browser says the local date and times: the end is the
// start plus the time worked, pauses left out). Under a minute worked: nothing saved.
router.post('/api/time/stop', async (req, res) => {
  const b = req.body || {};
  const out = await mutateDB((db) => {
    const t = normalizeTimeTracker(db.timeTracker);
    if (!t.running) return null;
    const r = t.running;
    let entry = null;
    const now = Date.now();
    const paused = pausedMs(r, now);
    if (!b.discard && isDay(b.date) && isTimeOfDay(b.start) && isTimeOfDay(b.end) && now - r.startedAt - paused >= 60000) {
      entry = applyEntry(db, normalizeTimeEntry({ id: nanoid(10), createdAt: now, pause: Math.round(paused / 60000) }), {
        date: b.date, start: b.start, end: b.end, planId: r.planId, clientId: r.clientId, project: r.project, activity: r.activity, details: 'details' in b ? b.details : r.details,
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
    head: ['Datum', 'Startzeit', 'Endzeit', 'Dauer (h)', 'Kunde', 'Projekt', 'Tätigkeit', 'Details & Ergebnisse'], money: ['Satz', 'Betrag'],
    total: 'Summe', byClient: 'Nach Kunde', byProject: 'Nach Projekt', byActivity: 'Nach Tätigkeit', byMonth: 'Nach Monat',
    hours: 'Stunden', entries: 'Einträge', amount: 'Betrag',
    period: 'Zeitraum', all: 'alle Einträge', file: 'Zeiterfassung', none: '(ohne)',
  },
  en: {
    log: 'Time log', summary: 'Summary', lists: 'Lists',
    head: ['Date', 'Start', 'End', 'Duration (h)', 'Client', 'Project', 'Activity', 'Details & results'], money: ['Rate', 'Amount'],
    total: 'Total', byClient: 'By client', byProject: 'By project', byActivity: 'By activity', byMonth: 'By month',
    hours: 'Hours', entries: 'Entries', amount: 'Amount',
    period: 'Period', all: 'all entries', file: 'time-log', none: '(none)',
  },
};
// How money shows in Excel, per currency.
const MONEY_FMT = {
  EUR: '#,##0.00 "€"', USD: '"$"#,##0.00', GBP: '"£"#,##0.00', CHF: '"CHF "#,##0.00', JPY: '"¥"#,##0', CAD: '"CA$"#,##0.00', AUD: '"A$"#,##0.00',
};
const xmlAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Header colours: the app's own (near-black, teal line) or a classic office blue.
const LOOK = { app: { head: '1B1B1E', line: '2EC5D3', band: 'EAF8FA', tab: '2EC5D3' }, classic: { head: '2F5597', line: '1F3864', band: 'DDE6F3', tab: '2F5597' } };
function styles(look, currency) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.00"/><numFmt numFmtId="167" formatCode="${xmlAttr(MONEY_FMT[currency] || MONEY_FMT.EUR)}"/></numFmts>`
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
    + '<cellXfs count="13">'
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
    + '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 11 money
    + '<xf numFmtId="167" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 12 total money
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
const hours = (min) => Math.round((min / 60) * 100) / 100;
const cents = (v) => Math.round(v * 100) / 100;
const quoteSheet = (n) => `'${n.replace(/'/g, "''")}'`;
const lit = (v) => `"${String(v).replace(/"/g, '""')}"`; // a text in a formula

/** The export as { buffer, filename } for the entries that match the filters. */
export function timeWorkbook(db, q = {}) {
  const w = WORDS[q.lang === 'en' ? 'en' : 'de'];
  const look = LOOK[q.style === 'classic' ? 'classic' : 'app'];
  const currency = db.settings?.currency || 'EUR';
  const from = isDay(q.from) ? q.from : null; const to = isDay(q.to) ? q.to : null;
  const rows = db.timeEntries.map(normalizeTimeEntry)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .filter((e) => !q.plan || (q.plan === 'none' ? !e.planId : e.planId === q.plan))
    .filter((e) => !q.client || forClient(db, e, String(q.client)))
    .filter((e) => !q.activity || e.activity === q.activity)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e) => {
      const { plan, client, project } = whoOf(db, e);
      return { ...e, client: client?.name || '', projectName: project, rate: plan?.rate || null, min: entryMinutes(e) };
    });
  const n = rows.length;
  const money = rows.some((e) => e.rate); // Rate + Amount only when a project has a rate
  const head = money ? [...w.head, ...w.money] : w.head;
  const last = money ? 'J' : 'H';
  const log = [head.map((v) => ({ v, s: 1 }))];
  rows.forEach((e, i) => {
    const r = i + 2;
    log.push([
      { v: excelDate(e.date), s: 2 }, { v: excelTime(e.start), s: 3 }, { v: excelTime(e.end), s: 3 },
      { f: `ROUND(MOD(C${r}-B${r},1)*24,2)`, v: hours(e.min), s: 4 },
      { v: e.client, s: 0 }, { v: e.projectName, s: 0 }, { v: e.activity, s: 0 }, { v: e.details, s: 5 },
      ...(money ? [e.rate ? { v: e.rate, s: 11 } : { v: '', s: 11 },
        { f: `IF(I${r}="","",ROUND(D${r}*I${r},2))`, v: e.rate ? cents(hours(e.min) * e.rate) : '', s: 11 }] : []),
    ]);
  });
  const total = rows.reduce((m, e) => m + e.min, 0);
  const amountOf = (list) => cents(list.reduce((m, e) => m + (e.rate ? hours(e.min) * e.rate : 0), 0));
  // The totals count only what the filter buttons leave visible (SUBTOTAL 109).
  log.push([{ v: w.total, s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { f: n ? `SUBTOTAL(109,D2:D${n + 1})` : '0', v: hours(total), s: 7 },
    { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 },
    ...(money ? [{ v: '', s: 6 }, { f: `SUBTOTAL(109,J2:J${n + 1})`, v: amountOf(rows), s: 12 }] : [])]);

  // Drop-down lists (like the example): only the clients, projects and activities in this export —
  // one project's sheet offers that project, its client and the activities done on it.
  const sortText = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const clientList = sortText(rows.map((e) => e.client));
  const projectList = sortText(rows.map((e) => e.projectName));
  const used = new Set(rows.map((e) => e.activity).filter(Boolean));
  const acts = [...new Set([...normalizeTimeTracker(db.timeTracker).activities.filter((a) => used.has(a)), ...used])]; // in your order
  const listRows = Array.from({ length: Math.max(clientList.length, projectList.length, acts.length) }, (_, i) => [clientList[i] ?? '', projectList[i] ?? '', acts[i] ?? '']);
  const upto = n + 500; // new rows typed into the sheet get the lists too
  const lists = [
    ...(clientList.length ? [{ sqref: `E2:E${upto}`, source: `${w.lists}!$A$1:$A$${clientList.length}` }] : []),
    ...(projectList.length ? [{ sqref: `F2:F${upto}`, source: `${w.lists}!$B$1:$B$${projectList.length}` }] : []),
    ...(acts.length ? [{ sqref: `G2:G${upto}`, source: `${w.lists}!$C$1:$C$${acts.length}` }] : []),
  ];

  // Summary: by client, by project, by activity (live formulas on the log), by month.
  const L = quoteSheet(w.log);
  const col = (c) => `${L}!$${c}$2:$${c}$${n + 1}`;
  const period = from || to ? `${from || '…'} – ${to || '…'}` : w.all;
  // What the export is narrowed to (client, project, activity) — in the summary and the file name.
  const plan = q.plan && q.plan !== 'none' ? db.plans.find((p) => p.id === q.plan) : null;
  const client = q.client && q.client !== 'none' ? (db.clients || []).find((c) => c.id === q.client)
    : plan?.clientId ? (db.clients || []).find((c) => c.id === plan.clientId) : null;
  const scope = [
    client && `${w.head[4]}: ${client.name}`, plan && `${w.head[5]}: ${plan.name}`, q.activity && `${w.head[6]}: ${q.activity}`,
  ].filter(Boolean);
  const summary = [[{ v: w.log, s: 8 }], [{ v: [`${w.period}: ${period}`, ...scope, `${n} ${w.entries}`].join(' · '), s: 9 }], []];
  const heads = [w.hours, w.entries, ...(money ? [w.amount] : [])];
  // groups: [{ label, list, crit }] — crit: [[column, value], …] for SUMIFS / COUNTIFS (null = values only)
  const block = (title, groups) => {
    summary.push([{ v: title, s: 1 }, ...heads.map((v) => ({ v, s: 1 }))]);
    const first = summary.length + 1;
    for (const g of groups) {
      const crit = g.crit ? g.crit.map(([c, v]) => `${col(c)},${lit(v)}`).join(',') : null;
      summary.push([{ v: g.label, s: 0 },
        crit ? { f: `SUMIFS(${col('D')},${crit})`, v: hours(g.list.reduce((m, e) => m + e.min, 0)), s: 4 } : { v: hours(g.list.reduce((m, e) => m + e.min, 0)), s: 4 },
        crit ? { f: `COUNTIFS(${crit})`, v: g.list.length, s: 10 } : { v: g.list.length, s: 10 },
        ...(money ? [crit ? { f: `SUMIFS(${col('J')},${crit})`, v: amountOf(g.list), s: 11 } : { v: amountOf(g.list), s: 11 }] : [])]);
    }
    const lastRow = summary.length;
    const all = groups.flatMap((g) => g.list);
    summary.push([{ v: w.total, s: 6 },
      { f: groups.length ? `SUM(B${first}:B${lastRow})` : '0', v: hours(all.reduce((m, e) => m + e.min, 0)), s: 7 },
      { f: groups.length ? `SUM(C${first}:C${lastRow})` : '0', v: all.length, s: 7 },
      ...(money ? [{ f: groups.length ? `SUM(D${first}:D${lastRow})` : '0', v: amountOf(all), s: 12 }] : [])]);
    summary.push([]);
  };
  const groupBy = (keyOf) => {
    const m = new Map();
    for (const e of rows) { const k = keyOf(e); if (!m.has(k.key)) m.set(k.key, { ...k, list: [] }); m.get(k.key).list.push(e); }
    return [...m.values()].sort((a, b) => b.list.reduce((x, e) => x + e.min, 0) - a.list.reduce((x, e) => x + e.min, 0));
  };
  // (an empty cell can't be matched by a criterion — "(none)" rows are plain numbers)
  block(w.byClient, groupBy((e) => ({ key: e.client, label: e.client || w.none, crit: e.client ? [['E', e.client]] : null })));
  block(w.byProject, groupBy((e) => ({
    key: `${e.client}\u0000${e.projectName}`,
    label: e.projectName ? (e.client ? `${e.projectName} (${e.client})` : e.projectName) : `${w.none}${e.client ? ` (${e.client})` : ''}`,
    crit: e.projectName ? [['F', e.projectName], ...(e.client ? [['E', e.client]] : [])] : null,
  })));
  block(w.byActivity, groupBy((e) => ({ key: e.activity, label: e.activity || w.none, crit: e.activity ? [['G', e.activity]] : null })));
  summary.push([{ v: w.byMonth, s: 1 }, ...heads.map((v) => ({ v, s: 1 }))]);
  const months = groupBy((e) => ({ key: e.date.slice(0, 7), label: e.date.slice(0, 7) })).sort((a, b) => a.key.localeCompare(b.key));
  for (const g of months) summary.push([{ v: g.label, s: 0 }, { v: hours(g.list.reduce((m, e) => m + e.min, 0)), s: 4 }, { v: g.list.length, s: 10 }, ...(money ? [{ v: amountOf(g.list), s: 11 }] : [])]);

  const buffer = buildXlsx({
    stylesXml: styles(look, currency),
    sheets: [
      { name: w.log, rows: log, cols: [12, 10, 10, 11, 22, 28, 18, 48, ...(money ? [11, 13] : [])], freeze: true, autoFilter: `A1:${last}${n + 1}`, lists, tabSelected: true, tab: look.tab, headerHeight: 24 },
      { name: w.summary, rows: summary, cols: [40, 12, 10, ...(money ? [14] : [])], grid: false },
      { name: w.lists, rows: listRows, cols: [30, 36, 24], hidden: true },
    ],
  });
  const span = from || to ? `_${from || 'start'}_${to || 'today'}` : '';
  // ASCII only (it goes into a header): "Zeiterfassung_Acme_Launch-film_2026-09-01_2026-09-30.xlsx"
  const slug = (t) => String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const who = [client?.name, plan?.name, q.activity].filter(Boolean).map(slug).filter(Boolean).map((x) => `_${x}`).join('');
  return { buffer, filename: `${w.file}${who}${span}.xlsx` };
}

router.get('/api/time/export.xlsx', async (req, res) => {
  const db = await readDB();
  const { buffer, filename } = timeWorkbook(db, req.query);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});
