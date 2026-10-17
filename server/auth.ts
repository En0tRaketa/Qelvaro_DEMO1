import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { readAuth, writeAuth } from './store.ts';

export const MIN_PASSWORD = 8;

export function setPassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD} символов`);
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  writeAuth({ salt, hash, updatedAt: new Date().toISOString() });
  sessions.clear();
}

export function hasPassword() {
  return readAuth() !== null;
}

export function checkPassword(password: string): boolean {
  const a = readAuth();
  if (!a || typeof password !== 'string' || password.length > 200) return false;
  const got = scryptSync(password, a.salt, 64);
  const want = Buffer.from(a.hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Первый запуск: пароль можно задать переменной окружения ADMIN_PASSWORD. */
export function seedPasswordFromEnv() {
  const p = process.env.ADMIN_PASSWORD;
  if (p && !hasPassword()) setPassword(p);
}

// ---------- Сессии (в памяти; после перезапуска сервера нужно войти снова) ----------
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map<string, number>();
export const COOKIE = 'pp_admin';

export function createSession(): string {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function sessionToken(req: IncomingMessage): string | null {
  const t = readCookie(req, COOKIE);
  if (!t) return null;
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) {
    sessions.delete(t);
    return null;
  }
  return t;
}

export function destroySession(t: string | null) {
  if (t) sessions.delete(t);
}

export function sessionCookie(token: string, secure: boolean, maxAgeSec = SESSION_TTL / 1000) {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// ---------- Ограничение частоты запросов ----------
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10000) hits.clear();
  return false;
}
