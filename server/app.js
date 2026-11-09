import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { HttpError, cors, parseCookies, sameOriginGuard, securityHeaders, sendError } from './lib/http.js';
import { publicRouter } from './routes/public.js';
import { authRouter, requireAuth, resolveSession } from './routes/auth.js';
import { staffRouter } from './routes/staff.js';
import { billingRouter, chargilyWebhook } from './routes/billing.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(cors);
  app.use(securityHeaders);
  // Webhook de paiement : corps brut (vérification de signature), avant le parseur JSON.
  app.post('/api/billing/webhook', express.raw({ type: '*/*', limit: '100kb' }), chargilyWebhook(db));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie || '');
    next();
  });
  app.use('/api', sameOriginGuard);

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // Lien de confiance site <-> application Android (Play Store, TWA).
  app.get('/.well-known/assetlinks.json', (req, res) => {
    const pkg = process.env.ANDROID_PACKAGE;
    const fps = (process.env.ANDROID_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean);
    res.json(
      pkg && fps.length
        ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fps } }]
        : [],
    );
  });

  app.use('/api/public', publicRouter(db));
  app.use('/api/auth', resolveSession(db), authRouter(db));
  app.use('/api/admin', adminRouter(db));
  app.use('/api/staff/billing', requireAuth(db), billingRouter(db));
  app.use('/api/staff', requireAuth(db), staffRouter(db));

  app.use('/api', (req, res) => sendError(res, 404, 'NOT_FOUND', 'Ressource API inconnue.'));

  // Front-end compilé (production / démo). En développement, Vite sert le front.
  if (fs.existsSync(DIST)) {
    app.use(
      express.static(DIST, {
        index: false,
        setHeaders(res, filePath) {
          if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return sendError(res, err.status, err.code, err.message, err.extra);
    }
    if (err?.type === 'entity.parse.failed') {
      return sendError(res, 400, 'BAD_JSON', 'Corps de requête invalide.');
    }
    // Journalisation minimale : jamais de corps de requête ni de données patient.
    console.error('[error]', req.method, req.path, err?.stack?.split('\n').slice(0, 4).join(' | '));
    return sendError(res, 500, 'INTERNAL', 'Erreur interne. Merci de réessayer.');
  });

  return app;
}
