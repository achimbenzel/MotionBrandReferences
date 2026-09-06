/**
 * Minimal, dependency-free ZIP support for library export/import.
 *
 * Writer: STORE method only (no compression — the payload is videos, images and
 * PDFs that are already compressed), streamed so huge files never sit in memory.
 * Full ZIP64 support (sizes/offsets > 4 GB) via the standard sentinels + extra
 * fields, so archives and individual files above 4 GB work. Sizes are read from
 * stat and the CRC-32 is computed in a streaming pre-pass, so headers are always
 * correct up front and no data descriptors are used.
 *
 * Reader: parses the central directory (including ZIP64 records) and extracts
 * STORE and DEFLATE entries, verifying each CRC-32.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';

// Decide when to switch an entry to ZIP64. Real ZIP uses 0xFFFFFFFF; tests may
// lower it (env) so small files exercise the ZIP64 path without needing 4 GB.
const ZIP64_THRESHOLD = Number(process.env.ZIP64_THRESHOLD) || 0xFFFFFFFF;
const U32_MAX = 0xFFFFFFFF;
const U16_MAX = 0xFFFF;

// ---- CRC-32 ---------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crcStart = () => 0xFFFFFFFF;
function crcPush(state, buf) {
  let c = state;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c >>> 0;
}
const crcEnd = (state) => (state ^ 0xFFFFFFFF) >>> 0;
const crc32 = (buf) => crcEnd(crcPush(crcStart(), buf));

// ---- small helpers --------------------------------------------------------
function dosDateTime(d = new Date()) {
  const y = Math.max(1980, d.getFullYear());
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31);
  const date = (((y - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}
function writeChunk(stream, buf) {
  return new Promise((resolve, reject) => { stream.write(buf, (err) => (err ? reject(err) : resolve())); });
}
async function* walk(dir, base = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else if (e.isFile()) yield { full, rel: path.relative(base, full).split(path.sep).join('/') };
  }
}
function crc32File(full) {
  return new Promise((resolve, reject) => {
    let state = crcStart();
    const rs = fs.createReadStream(full);
    rs.on('error', reject);
    rs.on('data', (c) => { state = crcPush(state, c); });
    rs.on('end', () => resolve(crcEnd(state)));
  });
}
async function pumpFile(full, stream) {
  const rs = fs.createReadStream(full);
  rs.on('error', (e) => stream.emit('error', e));
  for await (const chunk of rs) {
    if (!stream.write(chunk)) await once(stream, 'drain');
  }
}

// ---- Writer ---------------------------------------------------------------
/**
 * Write a STORE/ZIP64 archive of every file under `srcDir` to `stream`.
 * `skip(relPath)` returns true to exclude an entry. Does not end the stream.
 */
export async function createZipToStream(srcDir, stream, { skip = () => false } = {}) {
  let offset = 0;
  const central = [];
  let anyZip64 = false;

  for await (const { full, rel } of walk(srcDir)) {
    if (skip(rel)) continue;
    const st = await fsp.stat(full);
    const size = st.size;
    const crc = await crc32File(full);
    const { time, date } = dosDateTime(st.mtime);
    const nameBuf = Buffer.from(rel, 'utf8');
    const utf8 = /[^\x00-\x7F]/.test(rel);
    const flags = utf8 ? 0x0800 : 0;
    const localOffset = offset;
    const sizeBig = size >= ZIP64_THRESHOLD;
    const offBig = localOffset >= ZIP64_THRESHOLD;
    if (sizeBig || offBig) anyZip64 = true;

    // Local file header (+ ZIP64 extra carrying sizes when needed).
    let localExtra = Buffer.alloc(0);
    if (sizeBig) {
      const p = Buffer.alloc(20);
      p.writeUInt16LE(0x0001, 0); p.writeUInt16LE(16, 2);
      p.writeBigUInt64LE(BigInt(size), 4); p.writeBigUInt64LE(BigInt(size), 12);
      localExtra = p;
    }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(sizeBig ? 45 : 20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(0, 8);            // STORE
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(sizeBig ? U32_MAX : size, 18);
    lh.writeUInt32LE(sizeBig ? U32_MAX : size, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(localExtra.length, 28);
    await writeChunk(stream, lh);
    await writeChunk(stream, nameBuf);
    if (localExtra.length) await writeChunk(stream, localExtra);
    offset += 30 + nameBuf.length + localExtra.length;

    await pumpFile(full, stream);     // raw file data (STORE)
    offset += size;

    central.push(centralHeader({ nameBuf, crc, size, localOffset, flags, time, date, sizeBig, offBig }));
  }

  // Central directory.
  const cdOffset = offset;
  let cdSize = 0;
  for (const c of central) { await writeChunk(stream, c); cdSize += c.length; }
  offset += cdSize;

  // ZIP64 end-of-central-directory record + locator, when anything overflows.
  const count = central.length;
  const needGlobal = anyZip64 || count >= U16_MAX || cdOffset >= U32_MAX || cdSize >= U32_MAX;
  if (needGlobal) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0);
    z.writeBigUInt64LE(44n, 4);       // size of this record minus 12
    z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14);
    z.writeUInt32LE(0, 16); z.writeUInt32LE(0, 20);
    z.writeBigUInt64LE(BigInt(count), 24);
    z.writeBigUInt64LE(BigInt(count), 32);
    z.writeBigUInt64LE(BigInt(cdSize), 40);
    z.writeBigUInt64LE(BigInt(cdOffset), 48);
    await writeChunk(stream, z);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    loc.writeUInt32LE(1, 16);
    await writeChunk(stream, loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count >= U16_MAX ? U16_MAX : count, 8);
  eocd.writeUInt16LE(count >= U16_MAX ? U16_MAX : count, 10);
  eocd.writeUInt32LE(cdSize >= U32_MAX ? U32_MAX : cdSize, 12);
  eocd.writeUInt32LE(cdOffset >= U32_MAX ? U32_MAX : cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  await writeChunk(stream, eocd);
}

function centralHeader({ nameBuf, crc, size, localOffset, flags, time, date, sizeBig, offBig }) {
  let extra = Buffer.alloc(0);
  if (sizeBig || offBig) {
    const parts = [];
    if (sizeBig) { const b = Buffer.alloc(16); b.writeBigUInt64LE(BigInt(size), 0); b.writeBigUInt64LE(BigInt(size), 8); parts.push(b); }
    if (offBig) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(localOffset), 0); parts.push(b); }
    const payload = Buffer.concat(parts);
    const hdr = Buffer.alloc(4); hdr.writeUInt16LE(0x0001, 0); hdr.writeUInt16LE(payload.length, 2);
    extra = Buffer.concat([hdr, payload]);
  }
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(45, 4);
  h.writeUInt16LE(sizeBig || offBig ? 45 : 20, 6);
  h.writeUInt16LE(flags, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(time, 12);
  h.writeUInt16LE(date, 14);
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(sizeBig ? U32_MAX : size, 20);
  h.writeUInt32LE(sizeBig ? U32_MAX : size, 24);
  h.writeUInt16LE(nameBuf.length, 28);
  h.writeUInt16LE(extra.length, 30);
  h.writeUInt16LE(0, 32);
  h.writeUInt16LE(0, 34);
  h.writeUInt16LE(0, 36);
  h.writeUInt32LE(0, 38);
  h.writeUInt32LE(offBig ? U32_MAX : localOffset, 42);
  return Buffer.concat([h, nameBuf, extra]);
}

// ---- Reader ---------------------------------------------------------------
async function readAt(fh, length, position) {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await fh.read(buf, read, length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  if (read < length) throw new Error('unexpected end of archive');
  return buf;
}
const readU64 = (buf, off) => Number(buf.readBigUInt64LE(off));

/** Parse the central directory; returns an array of entry descriptors. */
export async function readCentralDirectory(fh, fileSize) {
  const tailLen = Math.min(fileSize, 65557);
  const tail = await readAt(fh, tailLen, fileSize - tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) { if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory)');

  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  if (count === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX) {
    // Locator sits 20 bytes before the EOCD.
    const locPos = (fileSize - tailLen) + eocd - 20;
    const loc = await readAt(fh, 20, locPos);
    if (loc.readUInt32LE(0) !== 0x07064b50) throw new Error('zip64 locator not found');
    const z64Pos = readU64(loc, 8);
    const z = await readAt(fh, 56, z64Pos);
    if (z.readUInt32LE(0) !== 0x06064b50) throw new Error('zip64 EOCD not found');
    count = readU64(z, 32);
    cdSize = readU64(z, 40);
    cdOffset = readU64(z, 48);
  }

  const cd = await readAt(fh, cdSize, cdOffset);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    let compSize = cd.readUInt32LE(p + 20);
    let uncompSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const extra = cd.slice(p + 46 + nameLen, p + 46 + nameLen + extraLen);

    // ZIP64 extra: fields present in fixed order only when the base is sentinel.
    for (let e = 0; e + 4 <= extra.length;) {
      const id = extra.readUInt16LE(e); const sz = extra.readUInt16LE(e + 2); const body = e + 4;
      if (id === 0x0001) {
        let c = body;
        if (uncompSize === U32_MAX) { uncompSize = readU64(extra, c); c += 8; }
        if (compSize === U32_MAX) { compSize = readU64(extra, c); c += 8; }
        if (offset === U32_MAX) { offset = readU64(extra, c); c += 8; }
      }
      e = body + sz;
    }
    entries.push({ name, method, crc, compSize, uncompSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Read the raw compressed bytes of one entry as chunks.
async function* entryData(fh, entry) {
  const lh = await readAt(fh, 30, entry.offset);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header for ' + entry.name);
  const nameLen = lh.readUInt16LE(26);
  const extraLen = lh.readUInt16LE(28);
  let pos = entry.offset + 30 + nameLen + extraLen;
  let remaining = entry.compSize;
  while (remaining > 0) {
    const n = Math.min(1 << 20, remaining);
    yield await readAt(fh, n, pos);
    pos += n; remaining -= n;
  }
}

/** Extract one entry to `destPath`, verifying its CRC. */
async function extractEntry(fh, entry, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  if (entry.method === 0) {
    const ws = fs.createWriteStream(destPath);
    let state = crcStart();
    for await (const chunk of entryData(fh, entry)) {
      state = crcPush(state, chunk);
      if (!ws.write(chunk)) await once(ws, 'drain');
    }
    await new Promise((res, rej) => ws.end((err) => (err ? rej(err) : res())));
    if (crcEnd(state) !== entry.crc) throw new Error('CRC mismatch: ' + entry.name);
  } else if (entry.method === 8) {
    const parts = [];
    for await (const chunk of entryData(fh, entry)) parts.push(chunk);
    const data = zlib.inflateRawSync(Buffer.concat(parts));
    if (crc32(data) !== entry.crc) throw new Error('CRC mismatch: ' + entry.name);
    await fsp.writeFile(destPath, data);
  } else {
    throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
  }
}

// A safe entry name: relative, no drive/absolute, no ".." segment.
export function isSafeEntryName(name) {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split(/[/\\]/).includes('..');
}

/** Read one entry fully into a Buffer (used for validating db.json). */
export async function readEntryBuffer(fh, entry) {
  if (entry.method === 0) {
    const parts = [];
    for await (const chunk of entryData(fh, entry)) parts.push(chunk);
    const data = Buffer.concat(parts);
    if (crc32(data) !== entry.crc) throw new Error('CRC mismatch: ' + entry.name);
    return data;
  }
  const parts = [];
  for await (const chunk of entryData(fh, entry)) parts.push(chunk);
  const data = zlib.inflateRawSync(Buffer.concat(parts));
  if (crc32(data) !== entry.crc) throw new Error('CRC mismatch: ' + entry.name);
  return data;
}

/**
 * Validate that `zipPath` is a Design Reference export: every name is safe and a
 * parseable db.json is present. Returns { entries, db }. Throws on any problem.
 */
export async function validateLibraryZip(zipPath) {
  const fh = await fsp.open(zipPath, 'r');
  try {
    const { size } = await fh.stat();
    const entries = await readCentralDirectory(fh, size);
    for (const e of entries) {
      if (!isSafeEntryName(e.name)) throw new Error(`unsafe path in archive: ${e.name}`);
    }
    const dbEntry = entries.find((e) => e.name === 'db.json');
    if (!dbEntry) throw new Error('archive has no db.json — not a Design Reference export');
    const db = JSON.parse((await readEntryBuffer(fh, dbEntry)).toString('utf8'));
    if (!Array.isArray(db.projects) || !Array.isArray(db.plans) || !Array.isArray(db.galleries)) {
      throw new Error('db.json is missing expected fields');
    }
    return { entries, db };
  } finally {
    await fh.close();
  }
}

/** Extract every entry of `zipPath` into `destDir` (must already be validated). */
export async function extractZip(zipPath, destDir) {
  const fh = await fsp.open(zipPath, 'r');
  try {
    const { size } = await fh.stat();
    const entries = await readCentralDirectory(fh, size);
    for (const e of entries) {
      if (!isSafeEntryName(e.name)) throw new Error(`unsafe path in archive: ${e.name}`);
      const dest = path.join(destDir, e.name);
      if (e.name.endsWith('/')) { await fsp.mkdir(dest, { recursive: true }); continue; }
      await extractEntry(fh, e, dest);
    }
    return entries.length;
  } finally {
    await fh.close();
  }
}
