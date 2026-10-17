/**
 * Сервер сайта: отдаёт собранный сайт (dist/), загруженные картинки (data/uploads/)
 * и API: настройки, приём заявок с отправкой в Telegram и ВКонтакте, админку.
 * Без внешних зависимостей. Запуск: node server/index.ts (Node.js ≥ 22.18).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, extname, normalize, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadSettings, saveSettings, appendLead, readLeads, UPLOADS_DIR, type LeadRecord } from './store.ts';
import { checkPassword, createSession, destroySession, hasPassword, rateLimited, seedPasswordFromEnv, sessionCookie, sessionToken, setPassword, MIN_PASSWORD } from './auth.ts';
import { deliver } from './notify.ts';
import { validateConfig, validateIntegrations } from '../src/config/validate.ts';
import { buildLeadMessage, calcForLead, parseLead } from '../src/lib/lead.ts';
import { rubRange } from '../src/lib/format.ts';
import type { CompanyConfig, Integrations, PublicConfig } from '../src/config/types.ts';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
/** public/images — чтобы новые картинки работали без пересборки. */
const PUBLIC_IMAGES = resolve('public/images');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

seedPasswordFromEnv();
loadSettings();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function baseHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP);
}

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function clientIp(req: IncomingMessage) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isHttps(req: IncomingMessage) {
  return process.env.COOKIE_SECURE === '1' || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || 'encrypted' in req.socket;
}

/** Защита от запросов со сторонних сайтов: Origin должен совпадать с Host, тело — JSON. */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] && TRUST_PROXY ? String(req.headers['x-forwarded-host']) : req.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  } else if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
    return false;
  }
  return (req.headers['content-type'] ?? '').startsWith('application/json');
}

function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(Object.assign(new Error('Слишком большой запрос'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        fail(Object.assign(new Error('Некорректный JSON'), { status: 400 }));
      }
    });
    req.on('error', fail);
  });
}

function publicConfig(): PublicConfig {
  const s = loadSettings();
  const i = s.integrations;
  return {
    ...s.config,
    leadChannels: {
      telegram: i.telegram.enabled && !!i.telegram.botToken && !!i.telegram.chatId,
      vk: i.vk.enabled && !!i.vk.groupToken && !!i.vk.peerIds,
    },
  };
}

const hint = (t: string) => (t ? `…${t.slice(-4)}` : '');
function maskedIntegrations(i: Integrations) {
  return {
    telegram: { enabled: i.telegram.enabled, chatId: i.telegram.chatId, botToken: null, tokenHint: hint(i.telegram.botToken) },
    vk: { enabled: i.vk.enabled, peerIds: i.vk.peerIds, groupToken: null, tokenHint: hint(i.vk.groupToken) },
  };
}

const newLeadId = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${randomBytes(2).toString('hex').toUpperCase()}`;
};

// ------------------------------------------------------------------ API
async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  const ip = clientIp(req);
  const method = req.method ?? 'GET';

  if (path === '/api/config' && method === 'GET') return json(res, 200, publicConfig());

  if (path === '/api/lead' && method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { ok: false, errors: ['Запрос отклонён'] });
    if (rateLimited(`lead:${ip}`, 5, 10 * 60_000) || rateLimited('lead:all', 300, 60 * 60_000)) {
      return json(res, 429, { ok: false, errors: ['Слишком много заявок подряд. Попробуйте через несколько минут или позвоните нам.'] });
    }
    const body = (await readBody(req, 16 * 1024)) as Record<string, unknown>;
    // Скрытое поле-ловушка для ботов: людям не видно, боты его заполняют.
    if (typeof body.website === 'string' && body.website.trim()) return json(res, 200, { ok: true, id: 'X', delivered: true, channels: {} });
    const { config, integrations } = loadSettings();
    const { lead, errors } = parseLead(config, body);
    if (!lead) return json(res, 422, { ok: false, errors });
    const result = calcForLead(config, lead);
    const id = newLeadId();
    const message = buildLeadMessage(config, lead, result, { id, date: new Date() });
    let delivery: LeadRecord['delivery'] = { telegram: { status: 'off' }, vk: { status: 'off' } };
    try {
      delivery = await deliver(integrations, message);
    } finally {
      appendLead({ id, createdAt: new Date().toISOString(), message, total: rubRange(result.rangeLow, result.rangeHigh), name: lead.name, phone: lead.phone, delivery });
    }
    const delivered = delivery.telegram.status === 'sent' || delivery.vk.status === 'sent';
    if (!delivered) console.warn(`[lead ${id}] не доставлена: TG=${delivery.telegram.status} ${delivery.telegram.error ?? ''} VK=${delivery.vk.status} ${delivery.vk.error ?? ''}`);
    return json(res, 200, { ok: true, id, delivered, channels: { telegram: delivery.telegram.status, vk: delivery.vk.status } });
  }

  // ---------- Админка
  if (!path.startsWith('/api/admin/')) return json(res, 404, { ok: false, errors: ['Не найдено'] });
  if (method !== 'GET' && !sameOrigin(req)) return json(res, 403, { ok: false, errors: ['Запрос отклонён'] });

  if (path === '/api/admin/login' && method === 'POST') {
    if (!hasPassword()) return json(res, 409, { ok: false, errors: ['Пароль администратора не задан. Выполните на сервере: npm run set-password'] });
    if (rateLimited(`login:${ip}`, 8, 15 * 60_000)) return json(res, 429, { ok: false, errors: ['Слишком много попыток. Подождите 15 минут.'] });
    const { password } = (await readBody(req, 4096)) as { password?: string };
    if (!checkPassword(String(password ?? ''))) return json(res, 401, { ok: false, errors: ['Неверный пароль'] });
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(createSession(), isHttps(req)) });
  }

  const token = sessionToken(req);
  if (path === '/api/admin/session' && method === 'GET') return json(res, 200, { ok: true, authenticated: !!token, passwordSet: hasPassword() });
  if (!token) return json(res, 401, { ok: false, errors: ['Войдите в админку'] });

  if (path === '/api/admin/logout' && method === 'POST') {
    destroySession(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', isHttps(req), 0) });
  }

  if (path === '/api/admin/settings' && method === 'GET') {
    const s = loadSettings();
    return json(res, 200, { ok: true, config: s.config, integrations: maskedIntegrations(s.integrations) });
  }

  if (path === '/api/admin/settings' && method === 'PUT') {
    const body = (await readBody(req, 512 * 1024)) as { config?: CompanyConfig; integrations?: Record<string, Record<string, unknown>> };
    const current = loadSettings();
    const config = body.config ?? current.config;
    const errors = validateConfig(config);
    // Токены: null — оставить прежний, строка — заменить ('' — удалить).
    const inT = body.integrations?.telegram ?? {};
    const inV = body.integrations?.vk ?? {};
    const integrations: Integrations = {
      telegram: {
        enabled: Boolean(inT.enabled ?? current.integrations.telegram.enabled),
        chatId: String(inT.chatId ?? current.integrations.telegram.chatId).trim(),
        botToken: typeof inT.botToken === 'string' ? inT.botToken.trim() : current.integrations.telegram.botToken,
      },
      vk: {
        enabled: Boolean(inV.enabled ?? current.integrations.vk.enabled),
        peerIds: String(inV.peerIds ?? current.integrations.vk.peerIds).trim(),
        groupToken: typeof inV.groupToken === 'string' ? inV.groupToken.trim() : current.integrations.vk.groupToken,
      },
    };
    errors.push(...validateIntegrations(integrations));
    if (errors.length) return json(res, 422, { ok: false, errors });
    saveSettings({ config, integrations });
    return json(res, 200, { ok: true, integrations: maskedIntegrations(integrations) });
  }

  if (path === '/api/admin/leads' && method === 'GET') return json(res, 200, { ok: true, leads: readLeads(200) });

  if (path === '/api/admin/test-lead' && method === 'POST') {
    if (rateLimited(`test:${ip}`, 10, 5 * 60_000)) return json(res, 429, { ok: false, errors: ['Подождите пару минут'] });
    const { config, integrations } = loadSettings();
    const text = `ТЕСТОВАЯ ЗАЯВКА с сайта «${config.brand.name}».\nЕсли вы видите это сообщение, заявки будут приходить сюда.`;
    const channels = await deliver(integrations, text, true);
    return json(res, 200, { ok: true, channels });
  }

  if (path === '/api/admin/upload' && method === 'POST') {
    const { data } = (await readBody(req, 8 * 1024 * 1024)) as { data?: string };
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data ?? ''));
    if (!m) return json(res, 400, { ok: false, errors: ['Нужна картинка JPG, PNG или WebP'] });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return json(res, 413, { ok: false, errors: ['Картинка больше 5 МБ — уменьшите её'] });
    // Проверяем настоящий формат по первым байтам, а не по названию.
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    const ext = isJpg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
    if (!ext) return json(res, 400, { ok: false, errors: ['Файл не похож на картинку'] });
    const name = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOADS_DIR, name), buf);
    return json(res, 200, { ok: true, url: `/uploads/${name}` });
  }

  if (path === '/api/admin/password' && method === 'POST') {
    const { current, next } = (await readBody(req, 4096)) as { current?: string; next?: string };
    if (!checkPassword(String(current ?? ''))) return json(res, 401, { ok: false, errors: ['Текущий пароль неверный'] });
    if (String(next ?? '').length < MIN_PASSWORD) return json(res, 422, { ok: false, errors: [`Новый пароль — не короче ${MIN_PASSWORD} символов`] });
    setPassword(String(next));
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(createSession(), isHttps(req)) });
  }

  return json(res, 404, { ok: false, errors: ['Не найдено'] });
}

// ------------------------------------------------------------------ Статика
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

let indexTemplate: string | null = null;
function sendIndex(res: ServerResponse) {
  const file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Сайт не собран. Выполните npm run build.');
  }
  indexTemplate ??= readFileSync(file, 'utf8');
  const c = loadSettings().config;
  const title = escapeHtml(`${c.brand.name} — натяжные потолки в г. ${c.brand.city}`);
  const desc = escapeHtml(c.texts.heroSubtitle.slice(0, 200));
  const html = indexTemplate
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`);
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  res.end(html);
}

function sendFile(res: ServerResponse, root: string, rel: string, immutable: boolean) {
  const file = normalize(join(root, rel));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return false;
  const type = MIME[extname(file).toLowerCase()];
  if (!type) return false;
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
  createReadStream(file).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  baseHeaders(res);
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  try {
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    if (path.startsWith('/uploads/') && sendFile(res, UPLOADS_DIR, path.slice('/uploads/'.length), true)) return;
    if (path !== '/' && sendFile(res, DIST, path.slice(1), path.startsWith('/assets/'))) return;
    if (path.startsWith('/images/') && sendFile(res, PUBLIC_IMAGES, path.slice('/images/'.length), false)) return;
    if (path.startsWith('/images/') || path.startsWith('/assets/') || path.startsWith('/uploads/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    return sendIndex(res);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { ok: false, errors: [status === 500 ? 'Ошибка сервера' : (e as Error).message] });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Сайт: http://localhost:${PORT}   Админка: http://localhost:${PORT}/#/admin`);
  if (!hasPassword()) console.log('⚠ Пароль админки не задан. Выполните: npm run set-password');
});
