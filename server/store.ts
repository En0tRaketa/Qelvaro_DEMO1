/** Хранение без базы данных: JSON-файлы в папке data/ (не отдаётся наружу как статика). */
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, appendFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { defaultConfig, defaultIntegrations } from '../src/config/defaults.ts';
import type { Settings, CompanyConfig } from '../src/config/types.ts';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
export const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const SETTINGS = join(DATA_DIR, 'settings.json');
const LEADS = join(DATA_DIR, 'leads.jsonl');
const AUTH = join(DATA_DIR, 'auth.json');

mkdirSync(UPLOADS_DIR, { recursive: true });

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows */
  }
}

/** Новые поля из defaults дописываются в старые настройки при обновлении продукта. */
function withDefaults(cfg: Partial<CompanyConfig>): CompanyConfig {
  const out = structuredClone(defaultConfig) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(cfg)) {
    const def = out[k];
    out[k] = def && typeof def === 'object' && !Array.isArray(def) && v && typeof v === 'object' && !Array.isArray(v) ? { ...def, ...v } : v;
  }
  return out as unknown as CompanyConfig;
}

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  if (!existsSync(SETTINGS)) {
    cache = { config: structuredClone(defaultConfig), integrations: structuredClone(defaultIntegrations) };
    writeAtomic(SETTINGS, JSON.stringify(cache, null, 2));
    return cache;
  }
  const raw = JSON.parse(readFileSync(SETTINGS, 'utf8')) as Partial<Settings>;
  cache = {
    config: withDefaults(raw.config ?? {}),
    integrations: {
      telegram: { ...defaultIntegrations.telegram, ...raw.integrations?.telegram },
      vk: { ...defaultIntegrations.vk, ...raw.integrations?.vk },
    },
  };
  return cache;
}

export function saveSettings(s: Settings) {
  writeAtomic(SETTINGS, JSON.stringify(s, null, 2));
  cache = s;
}

export interface DeliveryStatus {
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
  delivery: { telegram: DeliveryStatus; vk: DeliveryStatus };
}

export function appendLead(rec: LeadRecord) {
  appendFileSync(LEADS, JSON.stringify(rec) + '\n', { encoding: 'utf8', mode: 0o600 });
}

export function readLeads(limit = 200): LeadRecord[] {
  if (!existsSync(LEADS)) return [];
  const lines = readFileSync(LEADS, 'utf8').trim().split('\n').filter(Boolean);
  const out: LeadRecord[] = [];
  for (const l of lines.slice(-limit).reverse()) {
    try {
      out.push(JSON.parse(l));
    } catch {
      /* пропускаем повреждённую строку */
    }
  }
  return out;
}

export interface AuthFile {
  salt: string;
  hash: string;
  updatedAt: string;
}
export function readAuth(): AuthFile | null {
  if (!existsSync(AUTH)) return null;
  try {
    return JSON.parse(readFileSync(AUTH, 'utf8'));
  } catch {
    return null;
  }
}
export function writeAuth(a: AuthFile) {
  writeAtomic(AUTH, JSON.stringify(a, null, 2));
}
