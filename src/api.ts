import type { CompanyConfig, PublicConfig } from './config/types';
import type { LeadInput } from './lib/lead';
import { defaultConfig, defaultIntegrations } from './config/defaults';

export class ApiError extends Error {
  errors: string[];
  status: number;
  constructor(status: number, errors: string[]) {
    super(errors.join('; '));
    this.status = status;
    this.errors = errors;
  }
}

const DEMO_KEY = 'potolok-profi-static-demo-v1';
type DemoState = { config: CompanyConfig; integrations: MaskedIntegrations; leads: LeadRecord[]; password: string; authenticated: boolean };
function demoState(): DemoState {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved) return JSON.parse(saved) as DemoState;
  } catch { /* use defaults */ }
  return {
    config: structuredClone(defaultConfig),
    integrations: {
      telegram: { enabled: false, chatId: '', botToken: null, tokenHint: 'В статическом демо недоступно' },
      vk: { enabled: false, peerIds: '', groupToken: null, tokenHint: 'В статическом демо недоступно' },
    },
    leads: [], password: 'demo12345', authenticated: false,
  };
}
function saveDemoState(s: DemoState) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* quota/private mode */ } }
function demoCall<T>(path: string, init?: RequestInit & { json?: unknown }): T {
  const s = demoState();
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = (init?.json ?? {}) as Record<string, any>;
  const ok = <R,>(value: R) => ({ ok: true, ...value }) as T;
  const fail = (status: number, message: string): never => { throw new ApiError(status, [message]); };
  if (path === '/api/config') return ({ ...s.config, leadChannels: { telegram: false, vk: false } }) as T;
  if (path === '/api/lead' && method === 'POST') {
    const id = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    s.leads.unshift({ id, createdAt: new Date().toISOString(), message: String(body.message ?? 'Демо-заявка'), total: String(body.total ?? '—'), name: String(body.name ?? ''), phone: String(body.phone ?? ''), delivery: { telegram: { status: 'off' }, vk: { status: 'off' } } });
    saveDemoState(s);
    return ({ ok: true, id, delivered: false, channels: {} }) as T;
  }
  if (path === '/api/admin/session') return ({ authenticated: s.authenticated, passwordSet: true }) as T;
  if (path === '/api/admin/login' && method === 'POST') {
    if (String(body.password ?? '') !== s.password) return fail(401, 'Неверный пароль');
    s.authenticated = true; saveDemoState(s); return ok({}) as T;
  }
  if (path === '/api/admin/logout' && method === 'POST') { s.authenticated = false; saveDemoState(s); return ok({}) as T; }
  if (path.startsWith('/api/admin/')) {
    if (!s.authenticated) return fail(401, 'Войдите в демо-админку');
    if (path === '/api/admin/settings' && method === 'GET') return ({ config: s.config, integrations: s.integrations }) as T;
    if (path === '/api/admin/settings' && method === 'PUT') {
      s.config = body.config as CompanyConfig;
      s.integrations = body.integrations as MaskedIntegrations;
      // Static hosting cannot securely store or use messenger tokens.
      s.integrations.telegram.botToken = null; s.integrations.telegram.tokenHint = 'Недоступно в статическом демо';
      s.integrations.vk.groupToken = null; s.integrations.vk.tokenHint = 'Недоступно в статическом демо';
      saveDemoState(s); return ({ integrations: s.integrations }) as T;
    }
    if (path === '/api/admin/leads') return ({ leads: s.leads }) as T;
    if (path === '/api/admin/test-lead' && method === 'POST') return ({ channels: { telegram: { status: 'off' }, vk: { status: 'off' } } }) as T;
    if (path === '/api/admin/upload' && method === 'POST') return ({ url: String(body.data ?? '') }) as T;
    if (path === '/api/admin/password' && method === 'POST') {
      if (String(body.current ?? '') !== s.password) return fail(400, 'Текущий пароль указан неверно');
      if (String(body.next ?? '').length < 8) return fail(400, 'Пароль должен содержать не менее 8 символов');
      s.password = String(body.next); saveDemoState(s); return ok({}) as T;
    }
  }
  return fail(404, 'Функция недоступна в статическом демо');
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  if (import.meta.env.VITE_STATIC_DEMO === 'true') return demoCall<T>(path, init);
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, ['Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.']);
  }
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; errors?: string[] }) | null;
  if (!res.ok || !body || body.ok === false) throw new ApiError(res.status, body?.errors ?? [`Ошибка сервера (${res.status})`]);
  return body;
}

export const getConfig = () => call<PublicConfig>('/api/config');

export interface LeadResponse {
  ok: true;
  id: string;
  delivered: boolean;
  channels: { telegram?: string; vk?: string };
}
export const sendLead = (lead: LeadInput & { website: string }) => call<LeadResponse>('/api/lead', { method: 'POST', json: lead });

// ---------- Админка
export interface MaskedIntegrations {
  telegram: { enabled: boolean; chatId: string; botToken: string | null; tokenHint: string };
  vk: { enabled: boolean; peerIds: string; groupToken: string | null; tokenHint: string };
}
export interface Delivery {
  status: 'sent' | 'failed' | 'off';
  error?: string;
}
export interface LeadRecord {
  id: string;
  createdAt: string;
  message: string;
  total: string;
  name: string;
  phone: string;
  delivery: { telegram: Delivery; vk: Delivery };
}

export const admin = {
  session: () => call<{ authenticated: boolean; passwordSet: boolean }>('/api/admin/session'),
  login: (password: string) => call<{ ok: true }>('/api/admin/login', { method: 'POST', json: { password } }),
  logout: () => call<{ ok: true }>('/api/admin/logout', { method: 'POST', json: {} }),
  settings: () => call<{ config: CompanyConfig; integrations: MaskedIntegrations }>('/api/admin/settings'),
  save: (config: CompanyConfig, integrations: MaskedIntegrations) =>
    call<{ integrations: MaskedIntegrations }>('/api/admin/settings', { method: 'PUT', json: { config, integrations } }),
  leads: () => call<{ leads: LeadRecord[] }>('/api/admin/leads'),
  testLead: () => call<{ channels: { telegram: Delivery; vk: Delivery } }>('/api/admin/test-lead', { method: 'POST', json: {} }),
  upload: (data: string) => call<{ url: string }>('/api/admin/upload', { method: 'POST', json: { data } }),
  password: (current: string, next: string) => call<{ ok: true }>('/api/admin/password', { method: 'POST', json: { current, next } }),
};
