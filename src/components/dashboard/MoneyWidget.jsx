import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, BellRing, Target, CalendarClock } from 'lucide-react';
import { api } from '../../lib/api.js';
import { fmtMoney } from '../../lib/clients.js';
import { monthsOf, yearOf, targetOf, paymentsIn, cancelBy, todayIso } from '../../lib/expenses.js';

const fmtDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
const plusDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/**
 * Money on the dashboard: what this month has to bring in (costs, your pay,
 * tax and reserve — see Expenses) against what you've invoiced so far, what
 * goes out this month, and the next payments and what to cancel in time.
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
  const list = d.expenses;

  if (!list.length) {
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

  const business = list.reduce((n, e) => n + yearOf(e, year).business, 0);
  const target = targetOf(business / 12, d.finance || {});
  const invoiced = (d.invoices || []).filter((i) => i.date.startsWith(month)).reduce((n, i) => n + i.amount, 0);
  const paid = (d.invoices || []).filter((i) => i.date.startsWith(month) && i.status === 'paid').reduce((n, i) => n + i.amount, 0);
  const out = monthsOf(list, year)[m - 1];
  const left = out.items.filter((x) => x.date >= today).reduce((n, x) => n + x.e.amount, 0);
  const pct = target.total ? Math.min(1, invoiced / target.total) : 0;
  const missing = Math.max(0, target.total - invoiced);
  const lastDay = new Date(year, m, 0).getDate();
  const daysLeft = lastDay - Number(today.slice(8, 10));

  const until = plusDays(today, 30);
  const next = [
    ...list.map((e) => ({ kind: 'cancel', e, date: cancelBy(e, today) })).filter((x) => x.date && x.date >= today && x.date <= until),
    ...list.flatMap((e) => paymentsIn(e, today, until).map((date) => ({ kind: 'pay', e, date }))),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'cancel' ? -1 : 1)).slice(0, compact ? 3 : 4);

  return (
    <section className={`dash-money ${compact ? 'compact' : ''}`}>
      {head}
      <div className="dash-money-body">
        <button type="button" className="dash-money-goal" onClick={() => navigate('/expenses')}>
          <span className="dash-money-goal-top"><Target size={13} /> To earn in {new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long' })}</span>
          <b>{money(invoiced)} <em>/ {money(target.total)}</em></b>
          <span className="dash-money-bar"><i style={{ width: `${Math.max(pct ? 2 : 0, pct * 100)}%` }} /></span>
          <small>
            {target.total <= 0 ? 'Set your pay on the Expenses page'
              : missing > 0 ? `${money(missing)} to go · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
                : 'Covered — well done'}
            {paid > 0 ? ` · ${money(paid)} paid` : ''}
          </small>
        </button>
        <div className="dash-money-nums">
          <span><b>{money(out.business)}</b><small>costs this month</small></span>
          <span><b>{money(left)}</b><small>still to go out</small></span>
          <span><b>{money(target.costs)}</b><small>⌀ costs a month</small></span>
        </div>
        <div className="dash-money-next">
          {next.length ? next.map((x) => (
            <button key={`${x.kind}-${x.e.id}-${x.date}`} type="button" className={`dash-money-row ${x.kind}`} onClick={() => navigate(`/expenses?e=${x.e.id}`)}>
              {x.kind === 'cancel' ? <BellRing size={13} /> : <CalendarClock size={13} />}
              <span className="dash-money-row-date">{x.date === today ? 'Today' : fmtDay(x.date)}</span>
              <span className="dash-money-row-what">{x.kind === 'cancel' ? `Cancel by — ${x.e.name}` : x.e.name}</span>
              <span className="dash-money-row-v">{fmtMoney(x.e.amount, cur)}</span>
            </button>
          )) : <p className="hint">Nothing due in the next 30 days.</p>}
        </div>
      </div>
    </section>
  );
}
