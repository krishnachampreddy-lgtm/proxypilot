import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import authRoutes from './routes/auth.js';
import leaveRoutes from './routes/leaves.js';
import proxyRoutes from './routes/proxies.js';
import hodRoutes from './routes/hod.js';
import studentRoutes from './routes/student.js';
import { aiEnabled } from './services/ai.js';
import { ensureSchema } from './db.js';
import { seedIfEmpty } from './seedData.js';

let ready;
const prepare = () => (ready ||= ensureSchema().then(seedIfEmpty).catch((e) => ((ready = null), Promise.reject(e))));

export function createApp() {
  const app = express();

  // Allow the React dev server (or any origin set in CLIENT_ORIGIN) to call the API
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, ai: aiEnabled() ? 'gemini' : 'rules-fallback' }));

  // Make sure tables + demo data exist before the first real request
  app.use('/api', async (req, res, next) => {
    try {
      await prepare();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/leaves', leaveRoutes);
  app.use('/api/proxies', proxyRoutes);
  app.use('/api/hod', hodRoutes);
  app.use('/api/student', studentRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

  // On Render (one service): also serve the built React app from client/dist
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}
