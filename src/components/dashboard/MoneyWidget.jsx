import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, BellRing, Target, CalendarClock, Repeat } from 'lucide-react';
import { api } from '../../lib/api.js';
import { fmtMoney } from '../../lib/clients.js';
import { monthsOf, yearOf, targetFor, paymentsIn, cancelBy, todayIso, inView, partOf, incomeNow, VIEWS } from '../../lib/expenses.js';

const fmtDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
// The same view as the switch on the Expenses page (business, private or both).
const viewOf = () => { try { const v = localStorage.getItem('exView'); return VIEWS.some((x) => x.key === v) ? v : 'business'; } catch { return 'business'; } };
const WORD = { business: 'business', private: 'private', both: 'all' };
const plusDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/**
 * Money on the dashboard: what this month has to bring in (costs, your pay,
 * tax and reserve — see Expenses, in the view chosen there) against what
 * you've invoiced so far, what goes out this month, and the next payments,
 * recurring income and what to cancel in time.
 */
export default function MoneyWidget({ reloadKey, compact = false }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((x) => { if (alive) setD(x); }).catch(() => { if (alive) setD(false); });
    return () => { alive = false; };
  }, [reloadKey]);
  if (d === false) return null;
  const head = (
    <div className="dash-card-kicker">
      <Wallet size={14} /> Money this month
      <button type="button" className="btn btn-sm btn-ghost dash-money-all" onClick={() => navigate('/expenses')}>Expenses <ArrowRight size={14} /></button>
    </div>
  );
  if (!d) return <section className="dash-money">{head}<div className="spinner" /></section>;

  const cur = d.currency || 'EUR';
  const money = (v) => fmtMoney(Math.round(v), cur);
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const month = today.slice(0, 7);
  const view = viewOf();
  const all = d.expenses;
  const list = all.filter((e) => inView(e, view));
  const income = d.income || [];

  if (!all.length && !income.length) {
    return (
      <section className={`dash-money ${compact ? 'compact' : ''}`}>
        {head}
        <button type="button" className="dash-money-empty" onClick={() => navigate('/expenses')}>
          <Wallet size={18} />
          <span><b>Track what your business costs</b><small>Subscriptions, insurance, hardware — and see what each month has to bring in.</small></span>
        </button>
      </section>
    );
  }

  const ys = all.map((e) => yearOf(e, year));
  const avgCosts = all.reduce((n, e, i) => n + ys[i].all * partOf(e, view), 0) / 12;
  const target = targetFor(view, { business: ys.reduce((n, y) => n + y.business, 0) / 12, private: ys.reduce((n, y) => n + y.private, 0) / 12 }, d.finance || {}, incomeNow(income, today));
  const invoiced = (d.invoices || []).filter((i) => i.date.startsWith(month)).reduce((n, i) => n + i.amount, 0);
  const paid = (d.invoices || []).filter((i) => i.date.startsWith(month) && i.status === 'paid').reduce((n, i) => n + i.amount, 0);
  const month0 = monthsOf(all, year)[m - 1];
  const outNow = view === 'business' ? month0.business : view === 'private' ? month0.private : month0.all;
  const left = month0.items.filter((x) => x.date >= today).reduce((n, x) => n + x.e.amount * partOf(x.e, view), 0);
  const pct = target.total ? Math.min(1, invoiced / target.total) : 0;
  const missing = Math.max(0, target.total - invoiced);
  const lastDay = new Date(year, m, 0).getDate();
  const daysLeft = lastDay - Number(today.slice(8, 10));

  const until = plusDays(today, 30);
  const next = [
    ...list.map((e) => ({ kind: 'cancel', e, date: cancelBy(e, today) })).filter((x) => x.date && x.date >= today && x.date <= until),
    ...list.flatMap((e) => paymentsIn(e, today, until).map((date) => ({ kind: 'pay', e, date }))),
    ...income.flatMap((x) => paymentsIn(x, today, until).map((date) => ({ kind: 'in', e: x, date }))),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'cancel' ? -1 : 1)).slice(0, compact ? 3 : 4);

  return (
    <section className={`dash-money ${compact ? 'compact' : ''}`}>
      {head}
      <div className="dash-money-body">
        <button type="button" className="dash-money-goal" onClick={() => navigate('/expenses')}>
          <span className="dash-money-goal-top"><Target size={13} /> To earn in {new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long' })} · {WORD[view]}</span>
          <b>{money(invoiced)} <em>/ {money(target.total)}</em></b>
          <span className="dash-money-bar"><i style={{ width: `${Math.max(pct ? 2 : 0, pct * 100)}%` }} /></span>
          <small>
            {target.total <= 0 ? (view === 'business' ? 'Add your costs on the Expenses page' : 'Set your pay on the Expenses page')
              : missing > 0 ? `${money(missing)} to go · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
                : 'Covered — well done'}
            {paid > 0 ? ` · ${money(paid)} paid` : ''}
            {target.income > 0 ? ` · ${money(target.income)} a month recurring` : ''}
          </small>
        </button>
        <div className="dash-money-nums">
          <span><b>{money(outNow)}</b><small>costs this month</small></span>
          <span><b>{money(left)}</b><small>still to go out</small></span>
          <span><b>{money(avgCosts)}</b><small>⌀ costs a month</small></span>
          {target.income > 0 && <span className="in"><b>+{money(target.income)}</b><small>recurring a month</small></span>}
        </div>
        <div className="dash-money-next">
          {next.length ? next.map((x) => (
            <button key={`${x.kind}-${x.e.id}-${x.date}`} type="button" className={`dash-money-row ${x.kind}`} onClick={() => navigate(`/expenses?${x.kind === 'in' ? 'i' : 'e'}=${x.e.id}`)}>
              {x.kind === 'cancel' ? <BellRing size={13} /> : x.kind === 'in' ? <Repeat size={13} /> : <CalendarClock size={13} />}
              <span className="dash-money-row-date">{x.date === today ? 'Today' : fmtDay(x.date)}</span>
              <span className="dash-money-row-what">{x.kind === 'cancel' ? `Cancel by — ${x.e.name}` : x.e.name}</span>
              <span className="dash-money-row-v">{x.kind === 'in' ? '+' : ''}{fmtMoney(x.e.amount, cur)}</span>
            </button>
          )) : <p className="hint">Nothing due in the next 30 days.</p>}
        </div>
      </div>
    </section>
  );
}
