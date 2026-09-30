// Clients (Work mode) — who projects are for: their people, billing details,
// notes and invoices (PDFs in the client's folder).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, sanitize, relPairs } from '../files.js';
import { trashFiles } from '../trashMoves.js';
import { upload } from '../upload.js';
import { normalizeClient, normalizeInvoice, str } from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { sourceAsUpload } from '../sources.js';

const router = createRouter();
export default router;

export const clientDir = (id) => path.join(DATA_DIR, 'client', id);
const CLIENT_FIELDS = ['name', 'color', 'website', 'email', 'phone', 'address', 'billingAddress', 'vatId', 'customerNumber', 'notes', 'contacts'];
const INVOICE_FIELDS = ['number', 'date', 'amount', 'status', 'planId', 'note'];
const INVOICE_EXT = /\.(pdf|png|jpe?g|webp)$/i;
const byName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The client a project (or time entry) is for: `clientId` if it exists, else a
 * `client` name — an existing client by that name, or a new one. → id or null.
 * Runs inside mutateDB.
 */
export function resolveClient(db, { clientId, client } = {}) {
  if (clientId === null || clientId === '') return null;
  if (typeof clientId === 'string') return db.clients.some((c) => c.id === clientId) ? clientId : undefined;
  const name = str(client, 200).trim();
  if (!name) return null;
  const hit = db.clients.find((c) => sameName(c.name, name));
  if (hit) return hit.id;
  const c = normalizeClient({ id: nanoid(10), name, createdAt: Date.now(), updatedAt: Date.now() });
  db.clients.push(c);
  return c.id;
}

router.get('/api/clients', async (_req, res) => {
  const db = await readDB();
  res.json({ clients: byName(db.clients) });
});

router.get('/api/clients/:id', async (req, res) => {
  const db = await readDB();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'not_found' });
  res.json({ client });
});

// A new client; a name you already have gives that one back (200).
router.post('/api/clients', async (req, res) => {
  const name = str(req.body.name, 200).trim();
  if (!name) return res.status(400).json({ error: 'name_required', message: 'Give the client a name.' });
  const out = await mutateDB((db) => {
    const hit = db.clients.find((c) => sameName(c.name, name));
    if (hit) return { client: hit, existed: true };
    const picked = Object.fromEntries(CLIENT_FIELDS.filter((k) => k in req.body).map((k) => [k, req.body[k]]));
    const c = normalizeClient({ ...picked, name, id: nanoid(10), createdAt: Date.now(), updatedAt: Date.now() });
    db.clients.push(c);
    return { client: c, existed: false };
  });
  res.status(out.existed ? 200 : 201).json(out);
});

router.patch('/api/clients/:id', async (req, res) => {
  const out = await mutateDB((db) => {
    const i = db.clients.findIndex((c) => c.id === req.params.id);
    if (i === -1) return { status: 404 };
    const cur = db.clients[i];
    const picked = Object.fromEntries(CLIENT_FIELDS.filter((k) => k in req.body).map((k) => [k, req.body[k]]));
    if ('name' in picked) {
      const name = str(picked.name, 200).trim();
      if (!name) delete picked.name;
      else if (db.clients.some((c) => c.id !== cur.id && sameName(c.name, name))) return { status: 409 };
    }
    const next = normalizeClient({ ...cur, ...picked, id: cur.id, logo: cur.logo, invoices: cur.invoices, createdAt: cur.createdAt, updatedAt: Date.now() });
    db.clients[i] = next;
    for (const p of db.plans) if (p.clientId === cur.id) p.client = next.name; // projects show the new name
    return { client: next };
  });
  if (out.status === 404) return res.status(404).json({ error: 'not_found' });
  if (out.status === 409) return res.status(409).json({ error: 'name_taken', message: 'You already have a client with that name.' });
  res.json(out);
});

// Logo (an upload, or a picture that's already in the app)
router.post('/api/clients/:id/logo', upload.single('logo'), async (req, res) => {
  await sourceAsUpload(req);
  const db = await readDB();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const stored = await replaceImage(clientDir(client.id), req.file.path, 'logo', req.file.originalname, client.logo, '.png');
  const updated = await mutateDB((d) => {
    const c = d.clients.find((x) => x.id === client.id);
    if (!c) return null;
    c.logo = stored; c.updatedAt = Date.now();
    return c;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ client: updated });
});
router.delete('/api/clients/:id/logo', async (req, res) => {
  let file = null;
  const updated = await mutateDB((db) => {
    const c = db.clients.find((x) => x.id === req.params.id);
    if (!c) return null;
    file = c.logo; c.logo = null; c.updatedAt = Date.now();
    return c;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (file) await safeRm(path.join(clientDir(req.params.id), path.basename(file)), { force: true }).catch(() => {});
  res.json({ client: updated });
});

// Invoices: PDFs (or a scan) with a number, date, amount, paid or not, and the project they're for.
router.post('/api/clients/:id/invoices', upload.array('files', 20), async (req, res) => {
  const files = (req.files || []).filter((f) => INVOICE_EXT.test(f.originalname));
  if (!files.length) throw new HttpError(400, 'file_required', 'Pick a PDF (or a picture of the invoice).');
  const db = await readDB();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'not_found' });
  const dir = path.join(clientDir(client.id), 'invoices');
  await fsp.mkdir(dir, { recursive: true });
  const added = [];
  for (const f of files) {
    const stored = await moveInto(dir, f.path, `${nanoid(6)}-${sanitize(f.originalname)}`);
    const one = files.length === 1; // number / amount from the form only fit a single file
    added.push(normalizeInvoice({
      id: nanoid(8), file: `invoices/${stored}`, name: str(f.originalname, 200),
      number: one ? req.body.number : '', date: req.body.date, amount: one ? req.body.amount : null,
      status: req.body.status, planId: req.body.planId, note: one ? req.body.note : '', addedAt: Date.now(),
    }));
  }
  const updated = await mutateDB((d) => {
    const c = d.clients.find((x) => x.id === client.id);
    if (!c) return null;
    c.invoices = [...added, ...c.invoices]; c.updatedAt = Date.now();
    return c;
  });
  if (!updated) {
    for (const inv of added) await safeRm(path.join(clientDir(client.id), inv.file), { force: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(201).json({ client: updated, invoices: added });
});

router.patch('/api/clients/:id/invoices/:invoiceId', async (req, res) => {
  const out = await mutateDB((db) => {
    const c = db.clients.find((x) => x.id === req.params.id);
    const i = c ? c.invoices.findIndex((x) => x.id === req.params.invoiceId) : -1;
    if (i === -1) return null;
    const picked = Object.fromEntries(INVOICE_FIELDS.filter((k) => k in req.body).map((k) => [k, req.body[k]]));
    const cur = c.invoices[i];
    c.invoices[i] = normalizeInvoice({ ...cur, ...picked, id: cur.id, file: cur.file, name: cur.name, addedAt: cur.addedAt });
    c.updatedAt = Date.now();
    return { client: c, invoice: c.invoices[i] };
  });
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

// → Trash (the PDF goes with it), so it can be restored.
router.delete('/api/clients/:id/invoices/:invoiceId', async (req, res) => {
  const trashId = nanoid(10);
  let rel = null;
  const out = await mutateDB((db) => {
    const c = db.clients.find((x) => x.id === req.params.id);
    const i = c ? c.invoices.findIndex((x) => x.id === req.params.invoiceId) : -1;
    if (i === -1) return null;
    const [invoice] = c.invoices.splice(i, 1);
    c.updatedAt = Date.now();
    rel = invoice.file;
    db.trash.unshift({ trashId, kind: 'invoice', deletedAt: Date.now(), data: { clientId: c.id, clientName: c.name, invoice, rels: rel ? [rel] : [] } });
    return { client: c };
  });
  if (!out) return res.status(404).json({ error: 'not_found' });
  if (rel) await trashFiles(trashId, relPairs(clientDir(req.params.id), path.join(TRASH_DIR, trashId), [rel]));
  res.json({ ...out, trashId });
});

// A client → Trash. Its projects stay (without a client); time booked on the
// client keeps its name as a free project. Restoring links them again.
router.delete('/api/clients/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const idx = db.clients.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return false;
    const [client] = db.clients.splice(idx, 1);
    const planIds = [];
    for (const p of db.plans) if (p.clientId === client.id) { p.clientId = null; p.client = ''; planIds.push(p.id); }
    const entryIds = [];
    for (const e of db.timeEntries) {
      if (e.clientId !== client.id) continue;
      e.clientId = null;
      if (!e.project) e.project = client.name;
      entryIds.push(e.id);
    }
    const r = db.timeTracker?.running;
    if (r?.clientId === client.id) { r.clientId = null; if (!r.project) r.project = client.name; }
    db.trash.unshift({ trashId, kind: 'client', deletedAt: Date.now(), data: client, planIds, entryIds });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  await trashFiles(trashId, [{ from: clientDir(req.params.id), to: path.join(TRASH_DIR, trashId) }]);
  res.json({ ok: true, trashId });
});
