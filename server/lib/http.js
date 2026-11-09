/** Petits utilitaires HTTP (sans dépendance externe). */

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function sendError(res, status, code, message, extra = {}) {
  res.status(status).json({ error: { code, message, ...extra } });
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', secure = false, path = '/' } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) bits.push('HttpOnly');
  if (secure) bits.push('Secure');
  if (maxAge != null) bits.push(`Max-Age=${Math.floor(maxAge)}`);
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, bits.join('; ')]);
}

export function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** En-têtes de sécurité de base (à durcir en production, voir README). */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('X-Robots-Tag', req.path.startsWith('/api/') ? 'noindex, nofollow' : 'index, follow');
  next();
}

/**
 * Protection CSRF par vérification d'origine sur les requêtes mutantes.
 * Les cookies sont SameSite=Lax ; on ajoute un contrôle d'Origin/Referer.
 */
export function sameOriginGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // clients non-navigateur (curl, tests)
  // Origine opaque « null » : document dans une iframe `sandbox` (aperçu
  // intégré). En démonstration on autorise (le cookie SameSite=Lax ne circule
  // pas dans ce contexte) ; en production la requête est refusée.
  if (origin === 'null') {
    if (process.env.DEMO_MODE === '0') return sendError(res, 403, 'CSRF_ORIGIN', 'Origine de requête refusée.');
    return next();
  }
  try {
    const o = new URL(origin);
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const extra = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = [host, ...extra.map((u) => (u.includes('://') ? new URL(u).host : u))];
    if (!allowed.includes(o.host)) {
      // En démonstration, un proxy (tunnel de prévisualisation) peut réécrire l'hôte :
      // on tolère l'écart mais on le signale. En production, l'écart est bloquant.
      // La protection principale reste le cookie SameSite=Lax (jamais envoyé
      // sur une requête POST inter-site).
      if (process.env.DEMO_MODE === '0') {
        return sendError(res, 403, 'CSRF_ORIGIN', 'Origine de requête refusée.');
      }
      console.warn('[csrf] origine non répertoriée tolérée en mode démonstration :', o.host, '≠', host);
    }
  } catch {
    return sendError(res, 400, 'BAD_ORIGIN', 'En-tête Origin invalide.');
  }
  return next();
}

/** Validation Zod -> HttpError 422 avec détails par champ. */
export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const fields = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(422, 'VALIDATION', 'Certains champs sont invalides.', { fields });
  }
  return parsed.data;
}

/**
 * CORS.
 *
 * Pourquoi : l'application doit pouvoir tourner dans un cadre intégré (iframe
 * `sandbox="allow-scripts"`), où le document a une origine opaque (« null »).
 * Dans ce contexte, le navigateur traite les scripts, les feuilles de style et
 * les appels /api comme des requêtes cross-origin : sans en-tête CORS, rien ne
 * s'affiche.
 *
 * Politique :
 *  - production (DEMO_MODE=0) : seules les origines de même hôte et celles
 *    listées dans ALLOWED_ORIGINS sont autorisées ;
 *  - démonstration : toute origine est reflétée (une prévisualisation peut
 *    passer par un proxy à hôte variable).
 * La protection réelle contre le CSRF reste le cookie SameSite=Lax + le
 * contrôle d'origine sur les requêtes mutantes (sameOriginGuard).
 */
export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();

  const prod = process.env.DEMO_MODE === '0';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const allowList = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s2) => s2.trim())
    .filter(Boolean)
    .map((u) => (u.includes('://') ? u : `https://${u}`));

  const sameHost = origin === `http://${host}` || origin === `https://${host}`;
  const allowed = !prod || sameHost || allowList.includes(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}
