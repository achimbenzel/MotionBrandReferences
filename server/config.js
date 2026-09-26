/**
 * Paths, ports and constants shared by the whole backend.
 *
 * Environment overrides (all optional):
 *   API_PORT       port of the API / production server        (default 4300)
 *   HOST           interface to listen on                     (default 127.0.0.1)
 *   DATA_DIR       where the library lives                    (default ./data)
 *   ALLOWED_HOSTS  extra host names the app may be reached by (comma-separated,
 *                  e.g. "library.example.com"; "*" disables the check)
 *   MAX_UPLOAD_MB  per-file upload limit in MB                (default 1024)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const DB_BAK = path.join(DATA_DIR, 'db.json.bak');   // mirror of the last good db.json
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');   // rotating db snapshots
export const TRASH_DIR = path.join(DATA_DIR, 'trash');      // soft-deleted items
export const DIST_DIR = path.join(ROOT, 'dist');

export const PORT = Number(process.env.API_PORT) || 4300;
// Loopback by default: the library has no login, so it must never be reachable
// from the LAN / internet by accident. On a VPS, put `tailscale serve` (or a
// reverse proxy) in front, or set HOST to the Tailscale IP.
export const HOST = process.env.HOST || '127.0.0.1';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const ALLOWED_HOSTS = String(process.env.ALLOWED_HOSTS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const MAX_SNAPSHOTS = 10;                       // how many db snapshots to keep
export const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;    // at most one snapshot per 3 min
export const TRASH_TTL_DAYS = 30;                     // auto-purge trashed items after this
export const DEFAULT_STORAGE_LIMIT = 80 * 1024 * 1024 * 1024; // 80 GB
// Per-file upload cap (MAX_UPLOAD_MB overrides it, e.g. for long 4K videos).
export const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 1024) * 1024 * 1024;

export const TYPES = new Set(['motion', 'color', 'branding', 'logo', 'businesscard', 'imagegallery', 'font', 'logonogo']);
export const TYPE_LABEL = {
  motion: 'Motion Design', color: 'Colors', branding: 'Branding', logo: 'Logos',
  businesscard: 'Business Cards', imagegallery: 'Image Gallery', font: 'Fonts', logonogo: 'Logo No Go',
};
// Top-level folders under data/ that hold library files (everything else —
// db.json, backups/, tmp/ — is internal and never served).
export const ENTITY_ROOTS = [...TYPES, 'plan', 'software', 'dashboard', 'inbox', 'mockup', 'mockup-model'];
