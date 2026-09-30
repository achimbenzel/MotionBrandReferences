// Clients: contacts, invoices, and linking projects and time to them.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { ID, TAG_KEYS, isDay, num, str } from './base.js';

// ---------------------------------------------------------------------------
// Clients — who a project is for: their people (with birthdays), billing
// details, notes and invoices. A project points at one (plan.clientId); its
// `client` name is kept in step for everything that shows it.
// ---------------------------------------------------------------------------
/** The id a client gets when it's made from an older project's client name (same name → same client). */
export const clientIdFor = (name) => `cl${createHash('sha1').update(String(name).trim().toLowerCase()).digest('hex').slice(0, 10)}`;
export const INVOICE_STATUSES = ['open', 'paid'];
const clientFile = (v) => (typeof v === 'string' && v && !v.includes('..') && !v.startsWith('/') ? str(v, 300) : null);
export function normalizeContact(c) {
  return {
    id: typeof c?.id === 'string' && ID.test(c.id) ? c.id : nanoid(8),
    name: str(c?.name, 120), role: str(c?.role, 120),
    email: str(c?.email, 200).trim(), phone: str(c?.phone, 60).trim(),
    birthday: isDay(c?.birthday) ? c.birthday : '', // shows in the dashboard's calendar
  };
}
export function normalizeInvoice(i) {
  const amount = Number(i?.amount);
  return {
    id: typeof i?.id === 'string' && ID.test(i.id) ? i.id : nanoid(8),
    file: clientFile(i?.file),               // invoices/… in the client's folder (a PDF)
    name: str(i?.name, 200),                  // the file's original name
    number: str(i?.number, 60), date: isDay(i?.date) ? i.date : '',
    amount: i?.amount === '' || i?.amount == null || !Number.isFinite(amount) || amount < 0 ? null : Math.round(Math.min(amount, 1e9) * 100) / 100,
    status: INVOICE_STATUSES.includes(i?.status) ? i.status : 'open',
    planId: typeof i?.planId === 'string' && ID.test(i.planId) ? i.planId : null,
    note: str(i?.note, 500),
    addedAt: num(i?.addedAt, 0, 1e14, 0) || Date.now(),
  };
}
export function normalizeClient(c) {
  const name = str(c?.name, 200).trim() || 'Client';
  return {
    id: typeof c?.id === 'string' && ID.test(c.id) ? c.id : clientIdFor(name),
    name,
    color: TAG_KEYS.has(c?.color) ? c.color : 'blue',
    logo: clientFile(c?.logo),
    website: str(c?.website, 300).trim(), email: str(c?.email, 200).trim(), phone: str(c?.phone, 60).trim(),
    address: str(c?.address, 1000), billingAddress: str(c?.billingAddress, 1000),
    vatId: str(c?.vatId, 60).trim(), customerNumber: str(c?.customerNumber, 60).trim(),
    notes: str(c?.notes, 20000),
    contacts: (Array.isArray(c?.contacts) ? c.contacts : []).slice(0, 50).map(normalizeContact),
    invoices: (Array.isArray(c?.invoices) ? c.invoices : []).slice(0, 2000).map(normalizeInvoice),
    createdAt: num(c?.createdAt, 0, 1e14, 0),
    updatedAt: num(c?.updatedAt, 0, 1e14, 0),
  };
}
// Projects written before clients existed only have a client name: it becomes
// a client (the same name → the same one, found again on every read until it's
// saved). A project whose client is gone has none.
export function linkClients(db) {
  const byId = new Map(db.clients.map((c) => [c.id, c]));
  const byName = new Map(db.clients.map((c) => [c.name.toLowerCase(), c]));
  for (const plan of db.plans) {
    if (!('clientId' in plan)) {
      const name = str(plan.client, 200).trim();
      let c = name ? byName.get(name.toLowerCase()) : null;
      if (name && !c) {
        c = normalizeClient({ id: clientIdFor(name), name, createdAt: plan.createdAt || 0 });
        db.clients.push(c); byId.set(c.id, c); byName.set(name.toLowerCase(), c);
      }
      plan.clientId = c ? c.id : null;
    }
    const c = typeof plan.clientId === 'string' ? byId.get(plan.clientId) : null;
    plan.clientId = c ? c.id : null;
    plan.client = c ? c.name : '';
  }
}
