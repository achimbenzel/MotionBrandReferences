import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Wallet, ChevronLeft, ChevronRight, FileSpreadsheet, ExternalLink, Trash2, Check, X, Search, BellRing, CalendarClock, Target, TrendingUp, Tag,
  Copy, Calculator, Repeat, FileArchive, Paperclip,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { fmtMoney } from '../lib/clients.js';
import { addDays, fmtDay as fmtDate } from '../lib/dates.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Receipts from '../components/expenses/Receipts.jsx';
import {
  EXPENSE_CATEGORIES, EXPENSE_IDEAS, INTERVALS, categoryOf, intervalOf, paymentsIn, yearOf, monthlyOf, nextPayment, cancelBy, monthsOf,
  targetFor, isActive, todayIso, VIEWS, partOf, inView, incomeMonthsOf, incomeNow, INCOME_INTERVALS, missingReceipts,
} from '../lib/expenses.js';
import { usePref } from '../lib/prefs.js';
import '../styles/expenses.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'short' }));
const fmtDay = (iso, opts = { day: 'numeric', month: 'short' }) => fmtDate(iso, opts);
const AHEAD = 45; // days of "coming up"
const VIEW_WORD = { business: 'business', private: 'private', both: 'business + private' };
const TARGET_WORD = { business: 'business', private: 'private', both: 'all' };

/**
 * Expenses: what the business costs — subscriptions, insurance, hardware …
 * each with its amount and rhythm (monthly, yearly …, or once), its business
 * part (the rest is private) and notice period. Per year and month, by
 * category — the business part, the private part or both; what's coming up
 * (and what to cancel in time) — and what has to come in each month to cover
 * it (in the same view) and pay you, against what you've invoiced; money that
 * comes in regularly (retainers) is taken off what's still to find. Each
 * expense keeps its receipts; which payments still lack one is shown, and a
 * year's receipts go to the tax advisor as one ZIP.
 */
export default function ExpensesPage({ reloadKey }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const saver = useSaver(500);
  const [data, setData] = useState(null); // { expenses, finance, invoices, currency }
  const [error, setError] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [editing, setEditing] = useState(null); // id | 'new'
  const [editingIncome, setEditingIncome] = useState(null); // id | 'new'
  const [show, setShow] = usePref('exShow', 'active'); // active | ended | all | receipts (payments without one)
  const [q, setQ] = useState('');
  const [view, setView] = usePref('exView', 'business', (v) => VIEWS.some((x) => x.key === v));

  useEffect(() => {
    let alive = true;
    api.listExpenses().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);
  // From the search: open that one.
  useEffect(() => {
    const id = params.get('e');
    const inc = params.get('i');
    if (id && data) {
      const e = data.expenses.find((x) => x.id === id);
      if (e && !inView(e, view)) setView('both'); // a private one opened from the search under Business …
      setEditing(id); setShow('all'); setParams({}, { replace: true });
    }
    if (inc && data) { setEditingIncome(inc); setParams({}, { replace: true }); }
  }, [params, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayIso();
  const cur = data?.currency || 'EUR';
  const money = (v) => fmtMoney(Math.round(v * 100) / 100, cur);
  const list = useMemo(() => data?.expenses || [], [data]);
  const finance = data?.finance || {};

  const sums = useMemo(() => {
    let all = 0; let business = 0; let priv = 0; let recurring = 0; let count = 0;
    for (const e of list) {
      const y = yearOf(e, year);
      all += y.all; business += y.business; priv += y.private;
      if (y.count && inView(e, view)) count += 1;
      if (isActive(e, today)) recurring += monthlyOf(e) * partOf(e, view);
    }
    const months = monthsOf(list, year);
    const invoiced = Array(12).fill(0); const paid = Array(12).fill(0);
    for (const i of data?.invoices || []) {
      if (!i.date.startsWith(String(year))) continue;
      const m = Number(i.date.slice(5, 7)) - 1;
      invoiced[m] += i.amount; if (i.status === 'paid') paid[m] += i.amount;
    }
    const byCat = EXPENSE_CATEGORIES.map((c) => {
      const ys = list.filter((e) => e.category === c.key).map((e) => yearOf(e, year));
      const b = ys.reduce((n, y) => n + y.business, 0); const p = ys.reduce((n, y) => n + y.private, 0);
      return { ...c, business: b, private: p, sum: view === 'business' ? b : view === 'private' ? p : b + p };
    }).filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
    const sum = view === 'business' ? business : view === 'private' ? priv : all;
    return { all, business, private: priv, sum, count, recurring, months, invoiced, paid, byCat };
  }, [list, year, data, today, view]);
  const income = useMemo(() => data?.income || [], [data]);
  const incMonths = useMemo(() => incomeMonthsOf(income, year), [income, year]);
  const incYear = incMonths.reduce((n, m) => n + m.sum, 0);
  // Recurring income a month: what's running today (this year), or the year's average (another year).
  const incPerMonth = year === Number(today.slice(0, 4)) ? incomeNow(income, today) : incYear / 12;
  const target = targetFor(view, { business: sums.business / 12, private: sums.private / 12 }, finance, incPerMonth);
  const thisMonth = Number(today.slice(5, 7)) - 1;
  const isNow = year === Number(today.slice(0, 4));
  const earned = isNow ? sums.invoiced[thisMonth] : 0;
  const dueThisMonth = isNow ? sums.months[thisMonth].items.filter((x) => x.date >= today).reduce((n, x) => n + x.e.amount * partOf(x.e, view), 0) : 0;
  const outOf = (m) => (view === 'business' ? m.business : view === 'private' ? m.private : m.all);
  const salary = finance.salary || 0;

  // Coming up: payments in the next weeks, and what to cancel in time.
  const upcoming = useMemo(() => {
    const until = addDays(today, AHEAD);
    const mine = list.filter((e) => inView(e, view));
    const pays = mine.flatMap((e) => paymentsIn(e, today, until).map((date) => ({ kind: 'pay', date, e })));
    const cancels = mine.map((e) => ({ e, date: cancelBy(e, today) })).filter((x) => x.date && x.date >= today && x.date <= addDays(today, 60)).map((x) => ({ kind: 'cancel', ...x }));
    const ins = income.flatMap((x) => paymentsIn(x, today, until).map((date) => ({ kind: 'in', date, e: x })));
    return [...cancels, ...ins, ...pays].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'cancel' ? -1 : 1)).slice(0, 8);
  }, [list, income, today, view]);

  // Payments of the year (up to today) without a receipt, per expense.
  const missing = useMemo(() => new Map(list.map((e) => [e.id, missingReceipts(e, year, today).length])), [list, year, today]);
  const missingCount = list.filter((e) => inView(e, view)).reduce((n, e) => n + missing.get(e.id), 0);
  const needle = q.trim().toLowerCase();
  const showing = (e) => (show === 'all' ? true : show === 'receipts' ? missing.get(e.id) > 0 : show === 'active' ? isActive(e, today) : !isActive(e, today));
  const shown = list.filter((e) => e.id === editing || (inView(e, view) && showing(e) // the one open stays, even once it has all its receipts
    && (!needle || `${e.name} ${e.notes} ${categoryOf(e.category).label}`.toLowerCase().includes(needle))));
  const groups = EXPENSE_CATEGORIES.map((c) => ({ ...c, items: shown.filter((e) => e.category === c.key) })).filter((g) => g.items.length);

  // ---- saving
  const setFinance = (patch) => {
    const next = { ...finance, ...patch };
    setData((d) => ({ ...d, finance: next }));
    saver.schedule('finance', () => api.updateSettings({ finance: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')));
  };
  const saveExpense = async (e) => {
    const body = { name: e.name, category: e.category, amount: Number(String(e.amount).replace(',', '.')) || 0, interval: e.interval, start: e.start, end: e.end || '', share: Number(e.share), notice: Number(e.notice) || 0, link: e.link || '', notes: e.notes || '' };
    try {
      if (e.id) { const x = await api.updateExpense(e.id, body); setData((d) => ({ ...d, expenses: d.expenses.map((y) => (y.id === x.id ? x : y)) })); }
      else { const x = await api.createExpense(body); setData((d) => ({ ...d, expenses: [...d.expenses, x] })); }
      setEditing(null);
    } catch (err) { toast(`Could not save: ${err.message}`, 'error'); }
  };
  const remove = async (e) => {
    try {
      const { trashId } = await api.removeExpense(e.id);
      setData((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }));
      setEditing(null);
      toast(`“${e.name}” removed`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setData(await api.listExpenses()); } });
    } catch (err) { toast(err.message, 'error'); }
  };
  // A new price from a day on: the old one ends the day before, a copy starts with the new amount.
  const changePrice = async (e, amount, from) => {
    try {
      const old = await api.updateExpense(e.id, { end: addDays(from, -1) });
      const x = await api.createExpense({ ...e, id: undefined, amount, start: from, end: e.end && e.end >= from ? e.end : '' });
      setData((d) => ({ ...d, expenses: [...d.expenses.map((y) => (y.id === old.id ? old : y)), x] }));
      setEditing(x.id);
      toast(`New price from ${fmtDay(from, { day: 'numeric', month: 'long', year: 'numeric' })}`);
    } catch (err) { toast(`Could not change it: ${err.message}`, 'error'); }
  };
  const saveIncome = async (x) => {
    const body = { name: x.name, clientId: x.clientId || '', amount: Number(String(x.amount).replace(',', '.')) || 0, interval: x.interval, start: x.start, end: x.end || '', notes: x.notes || '' };
    try {
      if (x.id) { const y = await api.updateIncome(x.id, body); setData((d) => ({ ...d, income: d.income.map((z) => (z.id === y.id ? y : z)) })); }
      else { const y = await api.createIncome(body); setData((d) => ({ ...d, income: [...d.income, y] })); }
      setEditingIncome(null);
    } catch (err) { toast(`Could not save: ${err.message}`, 'error'); }
  };
  const removeIncome = async (x) => {
    try {
      const { trashId } = await api.removeIncome(x.id);
      setData((d) => ({ ...d, income: d.income.filter((z) => z.id !== x.id) }));
      setEditingIncome(null);
      toast(`“${x.name}” removed`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setData(await api.listExpenses()); } });
    } catch (err) { toast(err.message, 'error'); }
  };
  const receiptsChanged = (x) => setData((d) => ({ ...d, expenses: d.expenses.map((y) => (y.id === x.id ? x : y)) }));
  const reload = async () => { try { setData(await api.listExpenses()); } catch (err) { toast(err.message, 'error'); } };
  const duplicate = async (e) => {
    try {
      const x = await api.createExpense({ ...e, id: undefined, name: `${e.name} (copy)` });
      setData((d) => ({ ...d, expenses: [...d.expenses, x] }));
      setEditing(x.id);
    } catch (err) { toast(err.message, 'error'); }
  };

  if (error) return <div className="center-msg">Couldn’t load: {error}</div>;
  if (!data) return <div className="spinner" />;

  // The chart: what goes out in this view, what was invoiced, recurring income behind them, and this view's target.
  const line = target.total;
  const maxBar = Math.max(line, ...sums.months.map(outOf), ...sums.invoiced, ...incMonths.map((m) => m.sum), 1);
  const privLeft = salary - sums.private / 12;
  const clientName = new Map((data.clients || []).map((c) => [c.id, c.name]));
  const blankIncome = { name: '', clientId: '', amount: '', interval: 'month', start: today, end: '', notes: '' };
  const blank = { name: '', category: view === 'private' ? 'home' : 'software', amount: '', interval: 'month', start: today, end: '', share: view === 'private' ? 0 : 100, notice: 0, link: '', notes: '' };

  return (
    <div className="ex-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Expenses</h1>
          <p>What your business costs — subscriptions, insurance, hardware … — and, if you like, what you pay privately: per year and month, and what has to come in each month.</p>
        </div>
        <div className="ex-head-tools">
          <div className="segmented ex-view" role="group" aria-label="Show the costs">
            {VIEWS.map((v) => <button key={v.key} type="button" className={view === v.key ? 'on' : ''} aria-pressed={view === v.key} onClick={() => setView(v.key)}>{v.label}</button>)}
          </div>
          <div className="ex-year" role="group" aria-label="Year">
            <button type="button" className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
            <b>{year}</b>
            <button type="button" className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight size={16} /></button>
          </div>
          <Menu align="right" title="Export" trigger={<button type="button" className="btn" disabled={!list.length}><FileSpreadsheet size={16} /> <span className="ex-hide-s">Export</span></button>}
            items={[
              { heading: `${year} as Excel — every payment, by category and month, and the recurring income` },
              { label: 'Deutsch', icon: <FileSpreadsheet size={15} />, onClick: () => { window.location.href = api.expensesExportUrl(year, 'de'); } },
              { label: 'English', icon: <FileSpreadsheet size={15} />, onClick: () => { window.location.href = api.expensesExportUrl(year, 'en'); } },
              { separator: true },
              { heading: `Receipts ${year} as ZIP — each named by its day and expense, with the Excel list` },
              { label: 'Deutsch', icon: <FileArchive size={15} />, onClick: () => { window.location.href = api.expenseReceiptsUrl(year, 'de'); } },
              { label: 'English', icon: <FileArchive size={15} />, onClick: () => { window.location.href = api.expenseReceiptsUrl(year, 'en'); } },
            ]} />
          <button type="button" className="btn btn-primary" onClick={() => { setEditing('new'); setShow('all'); }}><Plus size={16} /> New expense</button>
        </div>
      </div>

      <div className="ex-tiles">
        <div className="ex-tile">
          <span>{year} · {VIEW_WORD[view]}</span>
          <b>{money(sums.sum)}</b>
          <small>
            {view === 'both' ? `${money(sums.business)} business + ${money(sums.private)} private`
              : `${sums.count} expense${sums.count === 1 ? '' : 's'}${view === 'business' && sums.private > 0 ? ` · ${money(sums.private)} private` : ''}`}
          </small>
        </div>
        <div className="ex-tile">
          <span>⌀ a month</span>
          <b>{money(sums.sum / 12)}</b>
          <small>running now: {money(sums.recurring)} / month</small>
        </div>
        <div className="ex-tile accent">
          <span><Target size={12} /> To earn a month · {TARGET_WORD[view]}</span>
          <b>{money(target.total)}</b>
          <small>
            {target.income > 0 ? (target.rest > 0 ? `${money(target.income)} recurring · ${money(target.rest)} to find` : `Covered by recurring income · ${money(target.income - target.total)} over`)
              : target.hours != null ? `${Math.ceil(target.hours)} h at ${money(finance.rate)}/h · ${Math.round(target.weekHours)} h a week`
                : view === 'business' ? 'Set your hourly rate below' : 'Set your pay and rate below'}
          </small>
        </div>
        {isNow && (
          <div className="ex-tile">
            <span><TrendingUp size={12} /> {MONTHS[thisMonth]} so far</span>
            <b>{money(earned)} <em>/ {money(target.total)}</em></b>
            <span className="ex-progress"><i style={{ width: `${Math.min(100, target.total ? (earned / target.total) * 100 : 0)}%` }} /></span>
            <small>invoiced{sums.paid[thisMonth] ? ` · ${money(sums.paid[thisMonth])} paid` : ''}{dueThisMonth ? ` · ${money(dueThisMonth)} still to pay out` : ''}</small>
          </div>
        )}
      </div>

      <div className="ex-grid">
        <div className="ex-col">
          <section className="ex-card">
            <header><CalendarClock size={14} /> <b>Month by month</b> <em>— {view === 'business' ? 'paid out (business part)' : view === 'private' ? 'your private costs' : 'business and private costs'} and invoiced, against what has to come in</em></header>
            <div className="ex-chart" style={{ '--t': line / maxBar }}>
              {sums.months.map((m, i) => {
                const items = m.items.filter((x) => inView(x.e, view));
                return (
                  <div key={i} className={`ex-month ${isNow && i === thisMonth ? 'now' : ''}`}
                    title={`${MONTHS[i]}: ${view === 'both' ? `business ${money(m.business)} + private ${money(m.private)}` : `${view} ${money(outOf(m))}`}${items.length ? ` (${items.map((x) => x.e.name).slice(0, 6).join(', ')}${items.length > 6 ? ' …' : ''})` : ''} · invoiced ${money(sums.invoiced[i])}${incMonths[i].sum ? ` · recurring income ${money(incMonths[i].sum)}` : ''}`}>
                    <div className="ex-bars">
                      {incMonths[i].sum > 0 && <span className="ex-ret" style={{ height: `${(incMonths[i].sum / maxBar) * 100}%` }} />}
                      <span className="ex-stack" style={{ height: `${(outOf(m) / maxBar) * 100}%` }}>
                        {view !== 'business' && m.private > 0 && <i className="priv" style={{ flexGrow: m.private }} />}
                        {view !== 'private' && m.business > 0 && <i className="out" style={{ flexGrow: m.business }} />}
                      </span>
                      <i className="in" style={{ height: `${(sums.invoiced[i] / maxBar) * 100}%` }} />
                    </div>
                    <small>{MONTHS[i]}</small>
                  </div>
                );
              })}
              {line > 0 && <span className="ex-target-line"><em>{money(line)}</em></span>}
            </div>
            <div className="ex-legend">
              {view !== 'private' && <span><i className="out" /> {view === 'both' ? 'business' : 'paid out'}</span>}
              {view !== 'business' && <span><i className="priv" /> {view === 'both' ? 'private' : 'paid out (private)'}</span>}
              <span><i className="in" /> invoiced</span>
              {incYear > 0 && <span><i className="ret" /> recurring income</span>}
              {line > 0 && <span><i className="line" /> to earn a month</span>}
            </div>
          </section>

          <section className="ex-card">
            <header><Tag size={14} /> <b>By category</b> <em>— {year}, {view === 'both' ? 'business and private' : `${view} part`}</em></header>
            {sums.byCat.length ? sums.byCat.map((c) => (
              <div key={c.key} className="ex-cat" title={view === 'both' ? `${c.label}: business ${money(c.business)} + private ${money(c.private)}` : undefined}>
                <span className="ex-cat-label"><i style={{ background: c.color }} />{c.label}</span>
                <span className={`ex-cat-bar ${view === 'both' ? 'split' : ''}`}>
                  <span style={{ width: `${(c.sum / sums.byCat[0].sum) * 100}%` }}>
                    {view !== 'private' && c.business > 0 && <i style={{ flexGrow: c.business, backgroundColor: c.color }} />}
                    {view !== 'business' && c.private > 0 && <i className="priv" style={{ flexGrow: c.private, backgroundColor: c.color }} />}
                  </span>
                </span>
                <span className="ex-cat-v">{money(c.sum)}<small>{Math.round((c.sum / sums.sum) * 100)} %</small></span>
              </div>
            )) : <p className="hint">{view === 'private' ? `No private costs in ${year}.` : `Nothing for ${year} yet.`}</p>}
            {view === 'both' && sums.private > 0 && sums.business > 0 && <div className="ex-legend"><span><i className="solid" /> business</span><span><i className="striped" /> private</span></div>}
          </section>
        </div>

        <div className="ex-col">
          <section className="ex-card ex-calc">
            <header><Calculator size={14} /> <b>What has to come in</b></header>
            <div className="ex-calc-fields">
              <label><span>Your pay a month <em>net</em></span><span className="ex-in"><input className="input" inputMode="decimal" value={finance.salary || ''} placeholder={sums.private > 0 ? 'your private costs' : '0'} onChange={(e) => setFinance({ salary: Number(e.target.value.replace(',', '.')) || 0 })} /><i>{cur}</i></span></label>
              <label><span>Tax on profit</span><span className="ex-in"><input className="input" inputMode="decimal" value={finance.taxRate ?? ''} onChange={(e) => setFinance({ taxRate: Number(e.target.value) || 0 })} /><i>%</i></span></label>
              <label><span>Reserve on top</span><span className="ex-in"><input className="input" inputMode="decimal" value={finance.reserve ?? ''} onChange={(e) => setFinance({ reserve: Number(e.target.value) || 0 })} /><i>%</i></span></label>
              <label><span>Your hourly rate</span><span className="ex-in"><input className="input" inputMode="decimal" value={finance.rate || ''} placeholder="—" onChange={(e) => setFinance({ rate: Number(e.target.value.replace(',', '.')) || 0 })} /><i>{cur}/h</i></span></label>
              <label><span>Weeks off a year</span><span className="ex-in"><input className="input" inputMode="numeric" value={finance.weeksOff ?? ''} onChange={(e) => setFinance({ weeksOff: Number(e.target.value) || 0 })} /><i>weeks</i></span></label>
            </div>
            <div className="ex-calc-sum">
              {view !== 'private' && <div><span>Business costs, ⌀ a month</span><b>{money(target.costs)}</b></div>}
              {view !== 'business' && <div><span>{target.needIsPrivate || !salary ? 'Your private costs, ⌀' : 'Your pay'} <em>net</em></span><b>{money(target.need)}</b></div>}
              {target.tax > 0 && <div><span>+ tax on it ({finance.taxRate} %)</span><b>{money(target.tax)}</b></div>}
              {target.reserve > 0 && <div><span>+ reserve ({finance.reserve} %)</span><b>{money(target.reserve)}</b></div>}
              <div className="total"><span>= to earn a month <em>· {TARGET_WORD[view]}</em></span><b>{money(target.total)}</b></div>
              {target.income > 0 && (
                <>
                  <div><span>− recurring income{isNow ? ', running now' : `, ⌀ in ${year}`}</span><b>{money(target.income)}</b></div>
                  <div className="rest"><span>{target.rest > 0 ? '= still to find' : '= covered, left over'}</span><b>{money(target.rest > 0 ? target.rest : target.income - target.total)}</b></div>
                </>
              )}
              {target.hours != null && (
                <p className="hint">At {money(finance.rate)}/h that’s <b>{Math.ceil(target.hours)} billable hours</b> a month — about <b>{Math.round(target.weekHours)} h a week</b> over {52 - (finance.weeksOff ?? 6)} working weeks{target.income > 0 ? (target.rest > 0 ? <>; what’s still to find is <b>{Math.ceil(target.restHours)} h</b></> : '; recurring income covers it') : ''}.</p>
              )}
              {view === 'business' && salary > 0 && <p className="hint">Your pay isn’t in here — <b>Private</b> or <b>Both</b> add it.</p>}
              {view !== 'business' && target.needIsPrivate && salary > 0 && <p className="hint">Your private costs are more than your pay, so they count instead.</p>}
              {sums.private > 0 && view !== 'business' && !target.needIsPrivate && salary > 0 && (
                <p className={`hint ex-calc-private ${salary > 0 && privLeft < 0 ? 'over' : ''}`}>
                  Private costs, ⌀ <b>{money(sums.private / 12)}</b> a month, come out of your pay{salary > 0
                    ? (privLeft >= 0 ? <> — <b>{money(privLeft)}</b> of it left.</> : <> — that’s <b>{money(-privLeft)}</b> more than it.</>) : '.'}
                </p>
              )}
              <p className="hint">Health insurance and pension? Add them as expenses — they’re part of the costs. Prices before VAT.</p>
            </div>
          </section>

          <section className="ex-card ex-income">
            <header>
              <Repeat size={14} /> <b>Recurring income</b> <em>— retainers & fixed money</em>
              {editingIncome !== 'new' && <button type="button" className="btn btn-sm btn-ghost ex-card-add" onClick={() => setEditingIncome('new')}><Plus size={14} /> Add</button>}
            </header>
            {editingIncome === 'new' && <IncomeEditor initial={blankIncome} clients={data.clients || []} currency={cur} onSave={saveIncome} onCancel={() => setEditingIncome(null)} />}
            {income.map((x) => (editingIncome === x.id ? (
              <IncomeEditor key={x.id} initial={x} clients={data.clients || []} currency={cur} onSave={saveIncome} onCancel={() => setEditingIncome(null)} onDelete={() => removeIncome(x)} />
            ) : (
              <IncomeRow key={x.id} x={x} client={clientName.get(x.clientId)} today={today} money={money} onOpen={() => setEditingIncome(x.id)} />
            )))}
            {!income.length && editingIncome !== 'new' && <p className="hint">A retainer or other money that comes in regularly — it’s taken off what you still have to earn each month.</p>}
            {(incYear > 0 || incPerMonth > 0) && (
              <div className="ex-income-sum">
                <span>{isNow ? 'A month, running now' : `⌀ a month in ${year}`}</span><b>{money(incPerMonth)}</b>
                <small>{money(incYear)} in {year}</small>
              </div>
            )}
          </section>

          <section className="ex-card">
            <header><BellRing size={14} /> <b>Coming up</b> <em>— next {AHEAD} days</em></header>
            {upcoming.length ? upcoming.map((x) => (
              <button key={`${x.kind}-${x.e.id}-${x.date}`} type="button" className={`ex-up ${x.kind}`} onClick={() => { if (x.kind === 'in') { setEditingIncome(x.e.id); return; } setShow('all'); setEditing(x.e.id); }}>
                <span className="ex-up-date">{x.date === today ? 'Today' : fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="ex-up-what">{x.kind === 'cancel' ? <><b>Cancel by</b> — {x.e.name} renews {fmtDay(nextPayment(x.e, today))}</> : x.e.name}</span>
                <span className="ex-up-v">{x.kind === 'cancel' ? `${money(x.e.amount)} / ${intervalOf(x.e.interval).per}` : x.kind === 'in' ? `+${money(x.e.amount)}` : money(x.e.amount)}</span>
              </button>
            )) : <p className="hint">Nothing due in the next {AHEAD} days.</p>}
          </section>
        </div>
      </div>

      <div className="ex-list-head">
        <h2>All expenses <span className="count">{shown.length}</span></h2>
        <div className="segmented segmented-sm" role="group" aria-label="Show">
          {[['active', 'Running'], ['ended', 'Ended'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
          {(missingCount > 0 || show === 'receipts') && (
            <button type="button" className={`ex-show-rc ${show === 'receipts' ? 'on' : ''}`} onClick={() => setShow('receipts')} title={`Payments in ${year} so far without a receipt`}>
              <Paperclip size={12} /> Missing <span className="count">{missingCount}</span>
            </button>
          )}
        </div>
        <label className="clients-search ex-search"><Search size={15} /><input value={q} placeholder="Find…" onChange={(e) => setQ(e.target.value)} aria-label="Find an expense" /></label>
      </div>
      {editing === 'new' && <ExpenseEditor initial={blank} currency={cur} onSave={saveExpense} onCancel={() => setEditing(null)} />}
      {!list.length && editing !== 'new' ? (
        <div className="empty ex-empty">
          <Wallet size={30} />
          <h3>No expenses yet</h3>
          <p>Add what your business pays for — Adobe, insurance, your phone, the laptop — monthly, yearly or once. The page adds it up per year and month and shows what each month has to bring in.</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> New expense</button>
        </div>
      ) : groups.map((g) => (
        <section key={g.key} className="ex-group">
          <div className="ex-group-head"><i style={{ background: g.color }} /><span>{g.label}</span><b>{money(g.items.reduce((n, e) => n + yearOf(e, year).all * partOf(e, view), 0))} <em>in {year}</em></b></div>
          {g.items.map((e) => (editing === e.id ? (
            <ExpenseEditor key={e.id} initial={e} currency={cur} onSave={saveExpense} onCancel={() => setEditing(null)} onDelete={() => remove(e)} onPrice={(a, from) => changePrice(e, a, from)} onDuplicate={() => duplicate(e)}
              receipts={<Receipts expense={e} year={year} today={today} onChange={receiptsChanged} onReload={reload} toast={toast} />} />
          ) : (
            <ExpenseRow key={e.id} e={e} year={year} today={today} money={money} view={view} missing={missing.get(e.id)} onOpen={() => setEditing(e.id)} onLink={() => window.open(e.link, '_blank', 'noopener')} />
          )))}
        </section>
      ))}
      {list.length > 0 && !shown.length && editing !== 'new' && (
        <p className="hint">{needle ? `Nothing matches “${q.trim()}”.`
          : !list.some((e) => inView(e, view)) ? (view === 'private'
            ? 'No private expenses yet — add one with New expense, or set one to Private or Split in its editor.'
            : 'No business expenses yet — they’re all private.')
            : show === 'receipts' ? `Every payment in ${year} so far has its receipt.` : show === 'ended' ? 'Nothing has ended.' : 'Nothing is running.'}</p>
      )}
      <div className="ex-foot hint">Invoices come from your <button type="button" className="ex-link" onClick={() => navigate('/clients')}>clients</button> (their dates and amounts).</div>
    </div>
  );
}

function ExpenseRow({ e, year, today, money, view, missing, onOpen, onLink }) {
  const iv = intervalOf(e.interval);
  const inYear = yearOf(e, year).all * partOf(e, view);
  const next = nextPayment(e, today);
  const cancel = cancelBy(e, today);
  const ended = !isActive(e, today);
  const kept = (e.receipts || []).filter((r) => r.date.startsWith(`${year}-`)).length;
  return (
    <div className={`ex-row ${ended ? 'ended' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen(); }}>
      <span className="ex-row-main">
        <b>{e.name || 'Untitled'}{e.link && <button type="button" className="icon-btn ex-row-link" onClick={(ev) => { ev.stopPropagation(); onLink(); }} aria-label="Open the link" title={e.link}><ExternalLink size={12} /></button>}</b>
        <small>
          {e.interval === 'once' ? `once · ${fmtDay(e.start, { day: 'numeric', month: 'short', year: 'numeric' })}` : `${iv.label.toLowerCase()} · since ${fmtDay(e.start, { month: 'short', year: 'numeric' })}`}
          {e.end && e.interval !== 'once' ? ` · ${ended ? 'ended' : 'ends'} ${fmtDay(e.end, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          {e.share === 0 ? ' · private' : e.share < 100 ? ` · ${e.share} % business` : ''}
          {e.notes ? ` · ${e.notes.split('\n')[0].slice(0, 60)}` : ''}
        </small>
      </span>
      <span className="ex-row-next">
        {!ended && next && <span>next {fmtDay(next)}</span>}
        {!ended && cancel && <span className={`ex-row-cancel ${cancel <= addDays(today, 30) ? 'soon' : ''}`}>cancel by {fmtDay(cancel)}</span>}
        {missing > 0 ? <span className="ex-row-rc miss" title={`${missing} payment${missing === 1 ? '' : 's'} in ${year} without a receipt`}><Paperclip size={11} /> {missing} missing</span>
          : kept > 0 && <span className="ex-row-rc" title={`${kept} receipt${kept === 1 ? '' : 's'} in ${year}`}><Paperclip size={11} /> {kept}</span>}
      </span>
      <span className="ex-row-amount"><b>{money(e.amount)}</b><small>{iv.per ? `/ ${iv.per}` : 'once'}</small></span>
      <span className="ex-row-year"><b>{money(inYear)}</b><small>{view === 'both' || e.share === 100 || (view === 'private' && e.share === 0) ? `in ${year}` : `${view} in ${year}`}</small></span>
    </div>
  );
}

/** An expense being added or changed. */
function ExpenseEditor({ initial, currency, onSave, onCancel, onDelete, onPrice, onDuplicate, receipts }) {
  const [e, setE] = useState({ ...initial, amount: initial.amount === '' ? '' : String(initial.amount) });
  const [price, setPrice] = useState(null); // { amount, from } — a new price from a day on
  const [split, setSplit] = useState(() => Number(initial.share) > 0 && Number(initial.share) < 100); // part business, part private
  const set = (p) => setE((x) => ({ ...x, ...p }));
  const use = split ? 'split' : Number(e.share) === 0 ? 'private' : 'business';
  const setUse = (k) => {
    setSplit(k === 'split');
    if (k === 'business') set({ share: 100 });
    else if (k === 'private') set({ share: 0 });
    else if (!(Number(e.share) > 0 && Number(e.share) < 100)) set({ share: 50 });
  };
  const ok = e.name.trim() && Number(String(e.amount).replace(',', '.')) > 0 && e.start;
  const save = () => { if (ok) onSave(e); };
  const pickName = (v) => {
    const idea = EXPENSE_IDEAS.find(([n]) => n.toLowerCase() === v.trim().toLowerCase());
    if (idea && !initial.id && idea[2] != null) setSplit(false);
    set({ name: v, ...(idea && !initial.id ? { category: idea[1], ...(idea[2] != null ? { share: idea[2] } : {}) } : {}) });
  };
  const perYear = e.interval === 'once' ? null : (Number(String(e.amount).replace(',', '.')) || 0) * (12 / (intervalOf(e.interval).months || 12));
  return (
    <div className="ex-editor" onKeyDown={(ev) => { if (ev.key === 'Escape') onCancel(); if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); save(); } }}>
      <div className="ex-editor-row">
        <label className="ex-f grow"><span>Name</span><input className="input" list="ex-ideas" value={e.name} autoFocus placeholder="e.g. Adobe Creative Cloud" maxLength={120} onChange={(ev) => pickName(ev.target.value)} /></label>
        <label className="ex-f wide"><span>Category</span>
          <select className="input" value={e.category} onChange={(ev) => set({ category: ev.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <div className="ex-editor-row">
        <label className="ex-f"><span>Amount</span><span className="ex-in"><input className="input" inputMode="decimal" value={e.amount} placeholder="0.00" onChange={(ev) => set({ amount: ev.target.value })} /><i>{currency}</i></span></label>
        <label className="ex-f"><span>Paid</span>
          <select className="input" value={e.interval} onChange={(ev) => set({ interval: ev.target.value })}>
            {INTERVALS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </label>
        <label className="ex-f"><span>{e.interval === 'once' ? 'On' : 'First payment'}</span><input className="input" type="date" value={e.start} onChange={(ev) => set({ start: ev.target.value })} /></label>
        {e.interval !== 'once' && <label className="ex-f"><span>Ends <em>optional</em></span><input className="input" type="date" value={e.end} min={e.start} onChange={(ev) => set({ end: ev.target.value })} /></label>}
      </div>
      <div className="ex-editor-row">
        <div className="ex-f ex-use"><span>Counts as</span>
          <div className="segmented segmented-sm" role="group" aria-label="Counts as">
            {[['business', 'Business'], ['private', 'Private'], ['split', 'Split']].map(([k, l]) => (
              <button key={k} type="button" className={use === k ? 'on' : ''} aria-pressed={use === k} onClick={() => setUse(k)}>{l}</button>
            ))}
          </div>
        </div>
        {split && <label className="ex-f ex-f-s"><span>Business part</span><span className="ex-in"><input className="input" inputMode="numeric" value={e.share} onChange={(ev) => set({ share: ev.target.value.replace(/[^\d]/g, '').slice(0, 3) })} /><i>%</i></span></label>}
        {e.interval !== 'once' && (
          <label className="ex-f"><span>Notice to cancel</span><span className="ex-in"><input className="input" inputMode="numeric" value={e.notice || ''} placeholder="—" onChange={(ev) => set({ notice: ev.target.value.replace(/[^\d]/g, '').slice(0, 3) })} /><i>days</i></span></label>
        )}
        <label className="ex-f grow"><span>Link <em>account, contract</em></span><input className="input" value={e.link} placeholder="https://…" inputMode="url" onChange={(ev) => set({ link: ev.target.value })} /></label>
      </div>
      <label className="ex-f grow"><span>Notes</span><input className="input" value={e.notes} placeholder="Contract number, what it's for…" onChange={(ev) => set({ notes: ev.target.value })} /></label>
      {perYear != null && perYear > 0 && <div className="hint ex-peryear">{fmtMoney(Math.round(perYear * 100) / 100, currency)} a year{use === 'private' ? ' · private' : Number(e.share) < 100 ? ` · ${fmtMoney(Math.round(perYear * Number(e.share)) / 100, currency)} of it for the business, ${fmtMoney(Math.round(perYear * (100 - Number(e.share))) / 100, currency)} private` : ''}</div>}
      {price && (
        <div className="ex-price" onKeyDown={(ev) => {
          if (ev.key !== 'Enter') return;
          ev.stopPropagation(); ev.preventDefault();
          const a = Number(String(price.amount).replace(',', '.'));
          if (a > 0 && price.from) onPrice(a, price.from);
        }}>
          <span>New price</span>
          <span className="ex-in"><input className="input" inputMode="decimal" value={price.amount} autoFocus onChange={(ev) => setPrice({ ...price, amount: ev.target.value })} aria-label="New amount" /><i>{currency}</i></span>
          <span>from</span>
          <input className="input" type="date" value={price.from} onChange={(ev) => setPrice({ ...price, from: ev.target.value })} aria-label="From" />
          <button type="button" className="btn btn-sm btn-primary" disabled={!(Number(String(price.amount).replace(',', '.')) > 0) || !price.from}
            onClick={() => onPrice(Number(String(price.amount).replace(',', '.')), price.from)}><Check size={13} /> Apply</button>
          <button type="button" className="icon-btn" onClick={() => setPrice(null)} aria-label="Cancel"><X size={14} /></button>
          <p className="hint">The payments before stay at the old price.</p>
        </div>
      )}
      <datalist id="ex-ideas">{EXPENSE_IDEAS.map(([n]) => <option key={n} value={n} />)}</datalist>
      {receipts || <p className="hint ex-rc-later"><Paperclip size={13} /> Receipts can be added once it’s saved.</p>}
      <div className="ex-editor-foot">
        {onDelete && <button type="button" className="btn btn-sm btn-ghost ex-del" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
        {onPrice && e.interval !== 'once' && !price && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPrice({ amount: String(initial.amount), from: nextPayment(initial) || todayIso() })}><TrendingUp size={14} /> Price changes…</button>}
        {onDuplicate && <button type="button" className="btn btn-sm btn-ghost" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>}
        <span className="ex-gap" />
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!ok}><Check size={14} /> Save</button>
      </div>
    </div>
  );
}

function IncomeRow({ x, client, today, money, onOpen }) {
  const iv = intervalOf(x.interval);
  const ended = !isActive(x, today);
  const next = ended ? '' : nextPayment(x, today);
  return (
    <button type="button" className={`ex-inc ${ended ? 'ended' : ''}`} onClick={onOpen}>
      <span className="ex-inc-main">
        <b>{x.name || 'Untitled'}</b>
        <small>
          {[client, `${iv.label.toLowerCase()} since ${fmtDay(x.start, { month: 'short', year: 'numeric' })}`,
            x.end ? `${ended ? 'ended' : 'until'} ${fmtDay(x.end, { day: 'numeric', month: 'short', year: 'numeric' })}` : '',
            next ? `next ${fmtDay(next)}` : ''].filter(Boolean).join(' · ')}
        </small>
      </span>
      <span className="ex-inc-v"><b>+{money(x.amount)}</b><small>/ {iv.per}</small></span>
    </button>
  );
}

/** Money that comes in regularly, being added or changed. */
function IncomeEditor({ initial, clients, currency, onSave, onCancel, onDelete }) {
  const [x, setX] = useState({ ...initial, amount: initial.amount === '' ? '' : String(initial.amount) });
  const set = (p) => setX((v) => ({ ...v, ...p }));
  const ok = x.name.trim() && Number(String(x.amount).replace(',', '.')) > 0 && x.start;
  const save = () => { if (ok) onSave(x); };
  // Picking a client names an unnamed one after it.
  const pickClient = (id) => {
    const c = clients.find((y) => y.id === id);
    set({ clientId: id, ...(c && !x.name.trim() ? { name: `Retainer ${c.name}` } : {}) });
  };
  const perMonth = (Number(String(x.amount).replace(',', '.')) || 0) / (intervalOf(x.interval).months || 1);
  return (
    <div className="ex-editor ex-inc-editor" onKeyDown={(ev) => { if (ev.key === 'Escape') onCancel(); if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); save(); } }}>
      <div className="ex-editor-row">
        <label className="ex-f grow"><span>Name</span><input className="input" value={x.name} autoFocus placeholder="e.g. Retainer Acme" maxLength={120} onChange={(ev) => set({ name: ev.target.value })} /></label>
        {clients.length > 0 && (
          <label className="ex-f"><span>Client <em>optional</em></span>
            <select className="input" value={x.clientId} onChange={(ev) => pickClient(ev.target.value)}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="ex-editor-row">
        <label className="ex-f"><span>Amount <em>before tax</em></span><span className="ex-in"><input className="input" inputMode="decimal" value={x.amount} placeholder="0.00" onChange={(ev) => set({ amount: ev.target.value })} /><i>{currency}</i></span></label>
        <label className="ex-f"><span>Comes in</span>
          <select className="input" value={x.interval} onChange={(ev) => set({ interval: ev.target.value })}>
            {INCOME_INTERVALS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </label>
      </div>
      <div className="ex-editor-row">
        <label className="ex-f"><span>First payment</span><input className="input" type="date" value={x.start} onChange={(ev) => set({ start: ev.target.value })} /></label>
        <label className="ex-f"><span>Until <em>optional</em></span><input className="input" type="date" value={x.end} min={x.start} onChange={(ev) => set({ end: ev.target.value })} /></label>
      </div>
      <label className="ex-f grow"><span>Notes</span><input className="input" value={x.notes} placeholder="What it covers, hours included…" onChange={(ev) => set({ notes: ev.target.value })} /></label>
      {x.interval !== 'month' && perMonth > 0 && <div className="hint">{fmtMoney(Math.round(perMonth * 100) / 100, currency)} a month</div>}
      <div className="ex-editor-foot">
        {onDelete && <button type="button" className="btn btn-sm btn-ghost ex-del" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
        <span className="ex-gap" />
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!ok}><Check size={14} /> Save</button>
      </div>
    </div>
  );
}
