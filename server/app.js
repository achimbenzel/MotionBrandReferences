/**
 * Builds the Express app: request guards, the /data file server, all API
 * routes, the production frontend and the JSON error handler.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR, DIST_DIR, IS_PROD } from './config.js';
import { cleanupTmpOnClose } from './upload.js';
import { hostGuard, csrfGuard, dataGuard, dataHeaders, errorHandler } from './http.js';
import projects from './routes/projects.js';
import plans from './routes/plans.js';
import software from './routes/software.js';
import board from './routes/board.js';
import trash from './routes/trash.js';
import search from './routes/search.js';
import settings from './routes/settings.js';
import library from './routes/library.js';
import maintenance from './routes/maintenance.js';
import inbox from './routes/inbox.js';
import mockups from './routes/mockups.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostGuard);
  app.use('/api', csrfGuard);
  app.use(express.json({ limit: '10mb' }));
  app.use(cleanupTmpOnClose);

  // The content library. express.static supports HTTP range requests, which
  // the video player needs for seeking. Only library folders are exposed.
  app.use('/data', dataGuard, express.static(DATA_DIR, { setHeaders: dataHeaders }));

  for (const r of [projects, plans, software, board, trash, search, settings, library, maintenance, inbox, mockups]) app.use(r);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // In production (npm start) serve the built frontend from the same origin.
  if (IS_PROD && fs.existsSync(DIST_DIR)) {
    // Vite emits content-hashed files under /assets — those can be cached
    // forever; index.html and other root files must stay fresh so a redeploy
    // is picked up.
    app.use(express.static(DIST_DIR, {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/data')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
