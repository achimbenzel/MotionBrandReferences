// The data-format migration and the unused-files cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, readJSON, exists } from './helpers.js';
import { seedLegacyLibrary, legacyFiles, png } from './fixtures/legacy-library.js';

// What the grid / detail pages show for each item, so we can prove the
// migration changes nothing visible.
async function snapshot(s) {
  const projects = (await s.api('/api/projects')).data.projects;
  const plans = (await s.api('/api/plans')).data.plans;
  const software = (await s.api('/api/software')).data.software;
  const galleries = (await s.api('/api/galleries')).data.galleries;
  return {
    projects: projects.map((p) => ({ id: p.id, type: p.type, title: p.title, notes: p.notes, thumb: p.thumb, tags: p.tags })),
    plans: plans.map((p) => ({ id: p.id, name: p.name, blocks: p.blocks.map((b) => ({ id: b.id, type: b.type, title: b.title, content: b.content, images: b.images, files: b.files, items: b.items })), milestones: p.milestones })),
    software: software.map((s) => ({ id: s.id, name: s.name, avatarEmoji: s.avatarEmoji, plugins: s.plugins, expressionGroups: s.expressionGroups, tutorials: s.tutorials })),
    galleries,
  };
}

test('migration: reports the old format, backs up, converts, and changes nothing visible', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const s = await startServer({ dataDir: dir });
  try {
    const status = (await s.api('/api/maintenance')).data;
    assert.equal(status.schemaVersion, 1);
    assert.equal(status.currentVersion, 2);
    assert.equal(status.needsMigration, true);
    const keys = status.changes.map((c) => c.key).sort();
    assert.deepEqual(keys, ['logos', 'plans', 'software']);
    assert.equal(status.changes.find((c) => c.key === 'logos').count, 3);

    const before = await snapshot(s);
    const originalDb = await fsp.readFile(path.join(dir, 'db.json'), 'utf8');

    const res = await s.api('/api/maintenance/migrate', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.data.migrated, true);
    assert.equal(res.data.schemaVersion, 2);
    assert.equal(res.data.needsMigration, false);
    // The untouched original is kept as a backup.
    assert.equal(await fsp.readFile(path.join(dir, 'backups', res.data.backup), 'utf8'), originalDb);

    const after = await snapshot(s);
    assert.deepEqual(after, before);

    // Stored shape is now current.
    const db = await readJSON(path.join(dir, 'db.json'));
    assert.equal(db.schemaVersion, 2);
    const plan1 = db.plans.find((p) => p.id === 'plan1');
    assert.ok(Array.isArray(plan1.blocks) && !('moodboard' in plan1) && !('info' in plan1));
    const sw = db.software[0];
    assert.ok(!('scripts' in sw) && !('expressions' in sw) && !('icon' in sw));
    const logo2 = db.projects.find((p) => p.id === 'logo2');
    assert.equal(logo2.image, 'dark.svg');
    assert.equal(logo2.logoLight, 'light.png', 'legacy file references are kept');
    assert.deepEqual(logo2.renditions[0], { color: '#111114', bg: '#FFFFFF' });
    const logo3 = db.projects.find((p) => p.id === 'logo3');
    assert.deepEqual(logo3.renditions, [{ color: '#111114', bg: '#222222' }, { color: '#FFFFFF', bg: '#222222' }, { color: 'original', bg: '#222222' }]);
    assert.deepEqual(logo3.rendition, { color: '#FFFFFF', bg: '#222222' });
    const logo1 = db.projects.find((p) => p.id === 'logo1');
    assert.equal(logo1.image, 'la.png');

    // Every file is still where it was.
    for (const [rel] of legacyFiles()) assert.ok(exists(path.join(dir, rel)), rel);

    // Running it again is a no-op.
    const again = await s.api('/api/maintenance/migrate', { method: 'POST' });
    assert.equal(again.data.migrated, false);
  } finally { await s.stop(); }
});

test('a fresh library starts on the current format', async () => {
  const s = await startServer();
  try {
    const status = (await s.api('/api/maintenance')).data;
    assert.equal(status.schemaVersion, 2);
    assert.equal(status.needsMigration, false);
  } finally { await s.stop(); }
});

test('unused files: found conservatively, moved to trash as one item, restorable', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const old = new Date(Date.now() - 24 * 3600 * 1000);
  const put = async (rel, buf, mtime = old) => {
    const p = path.join(dir, rel);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, buf);
    await fsp.utimes(p, mtime, mtime);
  };
  // Leftovers an older version could leave behind:
  await put('plan/plan2/banner.jpg', png(10, 10, [1, 2, 3]));          // re-uploaded banner, other ext
  await put('branding/ghost1/x.png', png(10, 10, [4, 5, 6]));          // folder of a project that never got saved
  // Things that must NOT be reported:
  await put('plan/plan2/fresh.png', png(10, 10, [7, 8, 9]), new Date()); // just uploaded
  await put('logo/logo2/.DS_Store', Buffer.from('x'));                  // hidden file
  // Everything the fixture references must count as used (make it old, too).
  for (const [rel] of legacyFiles()) await fsp.utimes(path.join(dir, rel), old, old);

  const s = await startServer({ dataDir: dir });
  try {
    const scan = (await s.api('/api/maintenance/unused')).data;
    assert.deepEqual(scan.files.map((f) => f.rel), ['branding/ghost1/x.png', 'plan/plan2/banner.jpg']);
    assert.equal(scan.count, 2);

    const moved = await s.api('/api/maintenance/unused', { method: 'POST', json: {} });
    assert.equal(moved.data.count, 2);
    assert.ok(!exists(path.join(dir, 'plan/plan2/banner.jpg')));
    assert.ok(!exists(path.join(dir, 'branding/ghost1')), 'empty leftover folder is pruned');
    assert.ok(exists(path.join(dir, 'plan/plan2/fresh.png')));
    assert.ok(exists(path.join(dir, 'plan/plan2/banner.png')), 'the real banner stays');

    const item = (await s.api('/api/trash')).data.items.find((t) => t.trashId === moved.data.trashId);
    assert.equal(item.kind, 'orphans');
    assert.equal(item.title, '2 unused files');

    await s.api(`/api/trash/${moved.data.trashId}/restore`, { method: 'POST' });
    assert.ok(exists(path.join(dir, 'plan/plan2/banner.jpg')));
    assert.ok(exists(path.join(dir, 'branding/ghost1/x.png')));
  } finally { await s.stop(); }
});
