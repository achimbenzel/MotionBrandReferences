// Clients: made from older projects' client names, edited, linked to projects
// (budget, rate), invoices, Trash — and the unused-files scan leaves their files alone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

let srv;
before(async () => {
  const dir = await tempDir();
  // A library from before clients: projects only carry a client name.
  await fsp.writeFile(path.join(dir, 'db.json'), JSON.stringify({
    schemaVersion: 2, projects: [], galleries: [], software: [], trash: [], planTemplates: [],
    plans: [
      { id: 'p1', name: 'Launch film', client: 'Acme', blocks: [], milestones: [], createdAt: 1000 },
      { id: 'p2', name: 'Social cutdowns', client: ' acme ', blocks: [], milestones: [], createdAt: 2000 },
      { id: 'p3', name: 'Own reel', client: '', blocks: [], milestones: [], createdAt: 3000 },
    ],
    settings: {},
  }));
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

test('older projects: their client names become clients (one per name, the same on every read)', async () => {
  const a = (await srv.api('/api/clients')).data.clients;
  assert.deepEqual(a.map((c) => c.name), ['Acme']);
  const b = (await srv.api('/api/clients')).data.clients;
  assert.equal(a[0].id, b[0].id);
  const plans = (await srv.api('/api/plans')).data.plans;
  const of = (id) => plans.find((p) => p.id === id);
  assert.deepEqual([of('p1').clientId, of('p2').clientId, of('p3').clientId], [a[0].id, a[0].id, null]);
  assert.deepEqual([of('p2').client, of('p1').budget, of('p1').rate], ['Acme', null, null]);
  assert.equal((await srv.api('/api/settings')).data.settings.currency, 'EUR');
  // Dates and numbers: shown the German way until chosen otherwise; unknown choices are ignored.
  assert.deepEqual((await srv.api('/api/settings')).data.settings.formats, { date: 'de', number: 'de' });
  let f = (await srv.api('/api/settings', { method: 'PATCH', json: { formats: { date: 'us' } } })).data.settings.formats;
  assert.deepEqual(f, { date: 'us', number: 'de' });
  f = (await srv.api('/api/settings', { method: 'PATCH', json: { formats: { date: 'klingon', number: 'en' } } })).data.settings.formats;
  assert.deepEqual(f, { date: 'us', number: 'en' });
});

test('clients: created with contacts and billing details, one per name, renamed everywhere', async () => {
  let r = await srv.api('/api/clients', { method: 'POST', json: {
    name: 'Globex', vatId: ' DE123456789 ', customerNumber: 'K-007', billingAddress: 'Main St 1\n12345 Town',
    contacts: [{ name: 'Anna', role: 'Marketing', email: 'anna@globex.test', phone: '+49 1', birthday: '1990-05-12' }, { name: 'Ben', birthday: '12.05.' }],
  } });
  assert.equal(r.status, 201);
  const g = r.data.client;
  assert.deepEqual([g.vatId, g.customerNumber, g.contacts.length, g.contacts[0].birthday, g.contacts[1].birthday], ['DE123456789', 'K-007', 2, '1990-05-12', '']);
  r = await srv.api('/api/clients', { method: 'POST', json: { name: 'globex' } });
  assert.deepEqual([r.status, r.data.existed, r.data.client.id], [200, true, g.id]);
  assert.equal((await srv.api(`/api/clients/${g.id}`, { method: 'PATCH', json: { name: 'ACME' } })).status, 409);

  // A project for it, then a rename shows on the project.
  r = await srv.api('/api/plans', { method: 'POST', json: { name: 'Rebrand', clientId: g.id } });
  const plan = r.data.plan;
  assert.deepEqual([plan.clientId, plan.client], [g.id, 'Globex']);
  r = await srv.api(`/api/clients/${g.id}`, { method: 'PATCH', json: { name: 'Globex Inc', notes: 'Pays in 14 days', invoices: [] } });
  assert.equal(r.data.client.name, 'Globex Inc');
  assert.equal((await srv.api(`/api/plans/${plan.id}`)).data.plan.client, 'Globex Inc');
});

test('projects: a client by id or by a new name, a budget (per project or month) and an hourly rate', async () => {
  let r = await srv.api('/api/plans', { method: 'POST', json: { name: 'Explainer', client: 'Initech' } });
  const p = r.data.plan;
  const initech = (await srv.api('/api/clients')).data.clients.find((c) => c.name === 'Initech');
  assert.equal(p.clientId, initech.id);
  r = await srv.api(`/api/plans/${p.id}`, { method: 'PATCH', json: { budget: { hours: '20', per: 'month' }, rate: '85.5' } });
  assert.deepEqual([r.data.plan.budget, r.data.plan.rate], [{ hours: 20, per: 'month' }, 85.5]);
  r = await srv.api(`/api/plans/${p.id}`, { method: 'PATCH', json: { budget: { hours: 0 }, rate: '', clientId: 'nope' } });
  assert.deepEqual([r.data.plan.budget, r.data.plan.rate, r.data.plan.clientId], [null, null, initech.id]);
  r = await srv.api(`/api/plans/${p.id}`, { method: 'PATCH', json: { clientId: null } });
  assert.deepEqual([r.data.plan.clientId, r.data.plan.client], [null, '']);
});

test('invoices: a PDF with number, amount and status; deleted to Trash and back with its file', async () => {
  const acme = (await srv.api('/api/clients')).data.clients.find((c) => c.name === 'Acme');
  const fd = new FormData();
  fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'Rechnung 2026-014.pdf');
  fd.append('number', '2026-014'); fd.append('amount', '1250.50'); fd.append('date', '2026-09-20'); fd.append('planId', 'p1');
  let r = await srv.api(`/api/clients/${acme.id}/invoices`, { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const inv = r.data.invoices[0];
  assert.deepEqual([inv.number, inv.amount, inv.status, inv.planId, inv.name], ['2026-014', 1250.5, 'open', 'p1', 'Rechnung 2026-014.pdf']);
  const abs = path.join(srv.dataDir, 'client', acme.id, inv.file);
  assert.ok(exists(abs));
  assert.equal((await fetch(`${srv.base}/data/client/${acme.id}/${inv.file}`)).status, 200);
  const bad = new FormData(); bad.append('files', new Blob(['x']), 'notes.txt');
  assert.equal((await srv.api(`/api/clients/${acme.id}/invoices`, { method: 'POST', body: bad })).status, 400);

  r = await srv.api(`/api/clients/${acme.id}/invoices/${inv.id}`, { method: 'PATCH', json: { status: 'paid', file: '../../db.json' } });
  assert.deepEqual([r.data.invoice.status, r.data.invoice.file], ['paid', inv.file]);

  // The scan for unused files leaves logos and invoices alone.
  const old = new Date(Date.now() - 3600e3);
  await fsp.utimes(abs, old, old);
  const unused = (await srv.api('/api/maintenance/unused')).data.files.map((f) => f.rel);
  assert.ok(!unused.some((rel) => rel.startsWith('client/')), unused.join(', '));

  r = await srv.api(`/api/clients/${acme.id}/invoices/${inv.id}`, { method: 'DELETE' });
  assert.ok(!exists(abs));
  const trash = (await srv.api('/api/trash')).data.items.find((t) => t.trashId === r.data.trashId);
  assert.deepEqual([trash.title, trash.subtitle], ['Invoice 2026-014', 'Invoice · Acme']);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.ok(exists(abs));
  assert.equal((await srv.api(`/api/clients/${acme.id}`)).data.client.invoices[0].status, 'paid');
});

test('deleting a client: its projects stay without one, its time keeps the name — restoring links them again', async () => {
  const acme = (await srv.api('/api/clients')).data.clients.find((c) => c.name === 'Acme');
  let r = await srv.api('/api/time/entries', { method: 'POST', json: { date: '2026-09-21', start: '10:00', end: '11:00', clientId: acme.id, activity: 'Meeting' } });
  const entry = r.data.entry;
  assert.equal(entry.clientId, acme.id);
  r = await srv.api(`/api/clients/${acme.id}`, { method: 'DELETE' });
  const { trashId } = r.data;
  const plans = (await srv.api('/api/plans')).data.plans;
  assert.deepEqual(plans.filter((p) => ['p1', 'p2'].includes(p.id)).map((p) => [p.clientId, p.client]), [[null, ''], [null, '']]);
  let e = (await srv.api('/api/time')).data.entries.find((x) => x.id === entry.id);
  assert.deepEqual([e.clientId, e.project], [null, 'Acme']);
  assert.ok(!exists(path.join(srv.dataDir, 'client', acme.id)));

  r = await srv.api(`/api/trash/${trashId}/restore`, { method: 'POST' });
  assert.equal(r.status, 200);
  const back = (await srv.api('/api/plans')).data.plans.filter((p) => ['p1', 'p2'].includes(p.id));
  assert.deepEqual(back.map((p) => p.client), ['Acme', 'Acme']);
  e = (await srv.api('/api/time')).data.entries.find((x) => x.id === entry.id);
  assert.deepEqual([e.clientId, e.project], [acme.id, '']);
  assert.equal((await srv.api(`/api/clients/${acme.id}`)).data.client.invoices.length, 1);
  assert.ok(exists(path.join(srv.dataDir, 'client', acme.id, 'invoices')));
});
