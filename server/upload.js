/**
 * Upload middleware — files land in a per-request tmp folder, then the route
 * handler moves them into their final home once the target id is known. The
 * tmp folder is always removed when the response ends (see cleanupTmpOnClose).
 */
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { TMP_DIR, MAX_UPLOAD_BYTES } from './config.js';
import { safeRm, sanitize } from './files.js';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (!req.tmpDir) {
      req.tmpDir = path.join(TMP_DIR, nanoid());
      fs.mkdirSync(req.tmpDir, { recursive: true });
    }
    cb(null, req.tmpDir);
  },
  filename: (_req, file, cb) => cb(null, `${nanoid(8)}__${sanitize(file.originalname)}`),
});
export const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } });
export const uploadArchive = multer({ storage }); // library import: no per-file size cap

export async function cleanupTmp(req) {
  if (req.tmpDir) await safeRm(req.tmpDir, { recursive: true, force: true }).catch(() => {});
}

// Remove a request's tmp folder once the response is done — whatever path the
// handler took (success, early 4xx, thrown error, aborted upload).
export function cleanupTmpOnClose(req, res, next) {
  res.on('close', () => { if (req.tmpDir) cleanupTmp(req); });
  next();
}

export function parseJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
