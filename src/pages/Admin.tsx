import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { CompanyConfig, ExtraKind, IllustrationKind, WhyItem } from '../config/types';
import { validateConfig } from '../config/validate';
import { admin, ApiError, type Delivery, type LeadRecord, type MaskedIntegrations } from '../api';
import { copyText } from '../lib/share';
import { servicePriceLabel } from '../lib/lead';
import Img from '../components/Img';

/**
 * Админка. Вход по паролю (хэш хранится на сервере в data/auth.json),
 * сессия — HttpOnly-cookie. Все данные — в JSON-файлах на сервере, без базы данных.
 */
export default function Admin() {
  const [state, setState] = useState<'loading' | 'login' | 'nopass' | 'ready' | 'offline'>('loading');
  const check = useCallback(() => {
    admin
      .session()
      .then((s) => setState(s.authenticated ? 'ready' : s.passwordSet ? 'login' : 'nopass'))
      .catch(() => setState('offline'));
  }, []);
  useEffect(check, [check]);

  if (state === 'loading') return <div className="page-state page-state--loading" aria-busy="true" />;
  if (state === 'offline') return <Center title="Сервер недоступен">Админка работает только при запущенном сервере сайта (npm start или npm run dev).</Center>;
  if (state === 'nopass')
    return (
      <Center title="Пароль администратора не задан">
        Задайте его на сервере командой <code>npm run set-password</code>, затем обновите страницу.
      </Center>
    );
  if (state === 'login') return <Login onDone={() => setState('ready')} />;
  return <Editor onLogout={() => setState('login')} />;
}

function Center({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="admin-center">
      <div className="admin-center__card">
        <h1>{title}</h1>
        <p>{children}</p>
        <a href="#/">← На сайт</a>
      </div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await admin.login(password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.errors.join(' ') : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-center">
      <form className="admin-center__card" onSubmit={submit}>
        <h1>Вход в админку</h1>
        <label className="field">
          <span className="field-label">Пароль</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="field-error">{error}</p>}
        <button className="btn btn--primary" disabled={busy || !password}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <a href="#/">← На сайт</a>
      </form>
    </div>
  );
}

const TABS = [
  ['leads', 'Заявки'],
  ['services', 'Услуги'],
  ['prices', 'Цены'],
  ['texts', 'Тексты'],
  ['company', 'Компания и соцсети'],
  ['channels', 'Telegram и ВК'],
  ['security', 'Пароль'],
] as const;
type Tab = (typeof TABS)[number][0];

type Save = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; errors: string[] };

function Editor({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (TABS.some(([k]) => `#/admin/${k}` === location.hash) ? (location.hash.split('/')[2] as Tab) : 'leads'));
  const [orig, setOrig] = useState<{ config: CompanyConfig; integrations: MaskedIntegrations } | null>(null);
  const [cfg, setCfg] = useState<CompanyConfig | null>(null);
  const [intg, setIntg] = useState<MaskedIntegrations | null>(null);
  const [save, setSave] = useState<Save>({ kind: 'idle' });
  const [loadError, setLoadError] = useState('');

  const load = useCallback(() => {
    admin
      .settings()
      .then((s) => {
        setOrig(structuredClone(s));
        setCfg(s.config);
        setIntg(s.integrations);
      })
      .catch((e) => (e instanceof ApiError && e.status === 401 ? onLogout() : setLoadError(String(e.message))));
  }, [onLogout]);
  useEffect(load, [load]);
  useEffect(() => {
    history.replaceState(null, '', `#/admin/${tab}`);
  }, [tab]);

  const errors = useMemo(() => (cfg ? validateConfig(cfg) : []), [cfg]);
  const dirty = !!orig && (JSON.stringify(orig.config) !== JSON.stringify(cfg) || JSON.stringify(orig.integrations) !== JSON.stringify(intg));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) return <Center title="Не удалось загрузить настройки">{loadError}</Center>;
  if (!cfg || !intg) return <div className="page-state page-state--loading" aria-busy="true" />;

  const edit = (fn: (d: CompanyConfig) => void) => {
    setCfg((d) => {
      const n = structuredClone(d!);
      fn(n);
      return n;
    });
    setSave({ kind: 'idle' });
  };
  const editI = (fn: (d: MaskedIntegrations) => void) => {
    setIntg((d) => {
      const n = structuredClone(d!);
      fn(n);
      return n;
    });
    setSave({ kind: 'idle' });
  };

  const doSave = async () => {
    if (errors.length) return setSave({ kind: 'error', errors });
    setSave({ kind: 'saving' });
    try {
      const r = await admin.save(cfg, intg);
      setOrig({ config: structuredClone(cfg), integrations: structuredClone(r.integrations) });
      setIntg(r.integrations);
      setSave({ kind: 'saved' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      setSave({ kind: 'error', errors: e instanceof ApiError ? e.errors : ['Не удалось сохранить'] });
    }
  };

  const logout = async () => {
    await admin.logout().catch(() => {});
    onLogout();
  };

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-bar__title">
          <strong>{cfg.brand.name}</strong>
          <span className="muted small">админка</span>
          <a href="#/" target="_blank" rel="noopener" className="small">
            Открыть сайт ↗
          </a>
        </div>
        <div className="admin-bar__actions">
          <span className={`admin-status admin-status--${save.kind}`} role="status">
            {save.kind === 'saving' && 'Сохраняем…'}
            {save.kind === 'saved' && 'Сохранено — сайт уже обновлён'}
            {save.kind === 'error' && 'Не сохранено'}
            {save.kind === 'idle' && (dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}
          </span>
          <button
            className="btn btn--ghost btn--small"
            disabled={!dirty}
            onClick={() => {
              setCfg(structuredClone(orig!.config));
              setIntg(structuredClone(orig!.integrations));
              setSave({ kind: 'idle' });
            }}
          >
            Отменить
          </button>
          <button className="btn btn--primary btn--small" onClick={doSave} disabled={!dirty || save.kind === 'saving'}>
            Сохранить
          </button>
          <button className="btn btn--ghost btn--small" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Разделы админки">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
            {label}
          </button>
        ))}
      </nav>

      <div className="admin-body">
        {(save.kind === 'error' || (errors.length > 0 && dirty)) && (
          <div className="notice notice--error" role="alert">
            <strong>Исправьте перед сохранением</strong>
            <ul>
              {(save.kind === 'error' ? save.errors : errors).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'leads' && <LeadsTab />}
        {tab === 'services' && <ServicesTab cfg={cfg} edit={edit} />}
        {tab === 'prices' && <PricesTab cfg={cfg} edit={edit} />}
        {tab === 'texts' && <TextsTab cfg={cfg} edit={edit} />}
        {tab === 'company' && <CompanyTab cfg={cfg} edit={edit} />}
        {tab === 'channels' && <ChannelsTab intg={intg} editI={editI} dirty={dirty} />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
}

type EditFn = (fn: (d: CompanyConfig) => void) => void;
const toNum = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
const newId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7)}`;
function move<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

// ------------------------------------------------------------------ Заявки
function LeadsTab() {
  const [leads, setLeads] = useState<LeadRecord[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    setError('');
    admin
      .leads()
      .then((r) => setLeads(r.leads))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <Panel title="Заявки с сайта" action={<button className="btn btn--small" onClick={load}>Обновить</button>}>
      <p className="muted small">Каждая заявка сохраняется на сервере (data/leads.jsonl), даже если Telegram или ВК не ответили. Показаны последние 200.</p>
      {error && <p className="field-error">{error}</p>}
      {leads === null && !error && <p className="muted">Загружаем…</p>}
      {leads?.length === 0 && <p className="admin-empty">Заявок пока нет. Они появятся здесь, как только клиент отправит расчёт с сайта.</p>}
      <div className="leads">
        {leads?.map((l) => (
          <article key={l.id} className="lead">
            <button className="lead__head" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
              <span className="lead__id">№ {l.id}</span>
              <span className="lead__date">{new Date(l.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="lead__who">
                <strong>{l.name}</strong> {l.phone}
              </span>
              <span className="lead__total">{l.total}</span>
              <span className="lead__pills">
                <Pill label="TG" d={l.delivery.telegram} />
                <Pill label="ВК" d={l.delivery.vk} />
              </span>
            </button>
            {open === l.id && (
              <div className="lead__body">
                <pre>{l.message}</pre>
                {[l.delivery.telegram.error, l.delivery.vk.error].filter(Boolean).map((e) => (
                  <p key={e} className="field-error">
                    {e}
                  </p>
                ))}
                <button className="btn btn--small" onClick={() => copyText(l.message)}>
                  Скопировать текст
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function Pill({ label, d }: { label: string; d: Delivery }) {
  const text = d.status === 'sent' ? 'доставлено' : d.status === 'failed' ? 'ошибка' : 'выкл.';
  return (
    <span className={`pill pill--${d.status}`} title={d.error ?? ''}>
      {label}: {text}
    </span>
  );
}

// ------------------------------------------------------------------ Услуги
const ILLUSTRATIONS: [IllustrationKind, string][] = [
  ['matte', 'Матовый'],
  ['glossy', 'Глянцевый'],
  ['satin', 'Сатиновый'],
  ['fabric', 'Тканевый'],
  ['shadow', 'Теневой профиль'],
  ['lines', 'Световые линии'],
  ['demolition', 'Демонтаж'],
  ['room', 'Комната'],
];

function ServicesTab({ cfg, edit }: { cfg: CompanyConfig; edit: EditFn }) {
  return (
    <Panel title="Карточки услуг">
      <p className="muted small">
        Кнопка «Рассчитать» на карточке открывает калькулятор с выбранным полотном и доп. работами. Цена на карточке считается из раздела «Цены» автоматически — или впишите свою подпись.
      </p>
      <div className="svc-admin">
        {cfg.services.map((s, i) => (
          <div className={`svc-admin__item ${s.enabled ? '' : 'is-off'}`} key={s.id}>
            <ImageField label="Картинка" value={s.image} fallback={s.illustration} onChange={(v) => edit((d) => (d.services[i].image = v))} />
            <div className="svc-admin__fields">
              <div className="admin-row-inline">
                <Toggle label="Показывать" checked={s.enabled} onChange={(v) => edit((d) => (d.services[i].enabled = v))} />
                <span className="spacer" />
                <button className="btn btn--ghost btn--small" onClick={() => edit((d) => move(d.services, i, -1))} disabled={i === 0} aria-label="Выше">
                  ↑
                </button>
                <button className="btn btn--ghost btn--small" onClick={() => edit((d) => move(d.services, i, 1))} disabled={i === cfg.services.length - 1} aria-label="Ниже">
                  ↓
                </button>
                <button className="btn btn--ghost btn--small" onClick={() => edit((d) => d.services.splice(i, 1))}>
                  Удалить
                </button>
              </div>
              <Text label="Название" value={s.title} onChange={(v) => edit((d) => (d.services[i].title = v))} />
              <Area label="Краткое описание" value={s.text} onChange={(v) => edit((d) => (d.services[i].text = v))} rows={2} />
              <div className="admin-grid">
                <Select
                  label="Полотно в калькуляторе"
                  value={s.preset.materialId ?? ''}
                  options={[['', '— не менять —'], ...cfg.materials.map((m) => [m.id, m.name] as [string, string])]}
                  onChange={(v) => edit((d) => (d.services[i].preset.materialId = v || undefined))}
                />
                <PresetExtra cfg={cfg} i={i} edit={edit} />
                <Text label="Подпись цены" hint={`Пусто — авто: «${servicePriceLabel(cfg, { ...s, priceOverride: '' }) || '—'}»`} value={s.priceOverride} onChange={(v) => edit((d) => (d.services[i].priceOverride = v))} />
                <Select label="Иллюстрация, пока нет фото" value={s.illustration} options={ILLUSTRATIONS} onChange={(v) => edit((d) => (d.services[i].illustration = v as IllustrationKind))} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() =>
          edit((d) =>
            d.services.push({ id: newId('svc'), title: 'Новая услуга', text: '', image: '', illustration: 'room', priceOverride: '', enabled: false, preset: { materialId: d.materials[0]?.id } }),
          )
        }
      >
        Добавить услугу
      </button>
    </Panel>
  );
}

function PresetExtra({ cfg, i, edit }: { cfg: CompanyConfig; i: number; edit: EditFn }) {
  const entries = Object.entries(cfg.services[i].preset.extras ?? {});
  const [id, qty] = entries[0] ?? ['', 0];
  const extra = cfg.extras.find((e) => e.id === id);
  const set = (nid: string, nq: number) =>
    edit((d) => {
      d.services[i].preset.extras = nid ? { [nid]: nq } : undefined;
    });
  return (
    <div className="field">
      <span className="field-label">Доп. работа в калькуляторе</span>
      <div className="admin-inline">
        <select value={id} onChange={(e) => set(e.target.value, cfg.extras.find((x) => x.id === e.target.value)?.kind === 'area' ? 1 : qty || 1)}>
          <option value="">— нет —</option>
          {cfg.extras.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        {extra && extra.kind !== 'area' && (
          <input type="number" min={0} aria-label="Количество по умолчанию" value={Number.isFinite(qty) ? qty : ''} onChange={(e) => set(id, toNum(e.target.value))} style={{ width: 90 }} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Цены
function PricesTab({ cfg, edit }: { cfg: CompanyConfig; edit: EditFn }) {
  const p = cfg.pricing;
  return (
    <>
      <Panel title="Модель цены и общие правила">
        <div className="admin-radio">
          <label>
            <input type="radio" checked={p.model === 'included'} onChange={() => edit((d) => (d.pricing.model = 'included'))} />
            <span>
              <strong>Модель А.</strong> Цена за м² уже включает монтаж
            </span>
          </label>
          <label>
            <input type="radio" checked={p.model === 'separate'} onChange={() => edit((d) => (d.pricing.model = 'separate'))} />
            <span>
              <strong>Модель Б.</strong> Монтаж считается отдельно, ₽/м²
            </span>
          </label>
        </div>
        <div className="admin-grid">
          <Num label="Монтаж, ₽/м²" hint={p.model === 'included' ? 'В модели А не используется' : undefined} disabled={p.model === 'included'} value={p.installationPerM2} onChange={(v) => edit((d) => (d.pricing.installationPerM2 = v))} />
          <Num label="Минимальный заказ, ₽" hint="0 — не применять" value={p.minOrder} onChange={(v) => edit((d) => (d.pricing.minOrder = v))} />
          <div className="field">
            <span className="field-label">Разброс цены</span>
            <div className="admin-inline">
              <span>±</span>
              <input type="number" min={0} aria-label="Разброс" value={Number.isFinite(p.range.value) ? p.range.value : ''} onChange={(e) => edit((d) => (d.pricing.range.value = toNum(e.target.value)))} />
              <select aria-label="Единица разброса" value={p.range.mode} onChange={(e) => edit((d) => (d.pricing.range.mode = e.target.value as 'percent' | 'fixed'))}>
                <option value="percent">%</option>
                <option value="fixed">₽</option>
              </select>
            </div>
          </div>
          <Num label="Округлять до, ₽" value={p.roundTo} onChange={(v) => edit((d) => (d.pricing.roundTo = v))} />
          <Num label="Макс. площадь, м²" value={p.maxArea} onChange={(v) => edit((d) => (d.pricing.maxArea = v))} />
        </div>
        <h3 className="admin-sub">Коэффициенты</h3>
        <p className="muted small">Умножают всю сумму и показываются клиенту отдельной строкой. Добавляйте, только если реально применяете.</p>
        {p.coefficients.map((k, i) => (
          <div className="admin-row admin-row--coef" key={k.id}>
            <Toggle label="" checked={k.enabled} onChange={(v) => edit((d) => (d.pricing.coefficients[i].enabled = v))} />
            <input aria-label="Название" value={k.label} onChange={(e) => edit((d) => (d.pricing.coefficients[i].label = e.target.value))} />
            <input aria-label="Множитель" type="number" step="0.01" value={Number.isFinite(k.factor) ? k.factor : ''} onChange={(e) => edit((d) => (d.pricing.coefficients[i].factor = toNum(e.target.value)))} />
            <button className="btn btn--ghost btn--small" onClick={() => edit((d) => d.pricing.coefficients.splice(i, 1))}>
              Удалить
            </button>
          </div>
        ))}
        <button className="btn btn--small" onClick={() => edit((d) => d.pricing.coefficients.push({ id: newId('k'), label: 'Высота потолка более 3 м', factor: 1.1, enabled: false }))}>
          Добавить коэффициент
        </button>
      </Panel>

      <Panel title="Полотна">
        <div className="admin-table">
          <div className="admin-table__head admin-row--mat">
            <span>Показ</span>
            <span>Название</span>
            <span>Описание</span>
            <span>₽/м²</span>
            <span>Цвет</span>
            <span />
          </div>
          {cfg.materials.map((m, i) => (
            <div className="admin-row admin-row--mat" key={m.id}>
              <Toggle label="" checked={m.enabled} onChange={(v) => edit((d) => (d.materials[i].enabled = v))} />
              <input aria-label="Название" value={m.name} onChange={(e) => edit((d) => (d.materials[i].name = e.target.value))} />
              <input aria-label="Описание" value={m.description} onChange={(e) => edit((d) => (d.materials[i].description = e.target.value))} />
              <input aria-label="Ставка за м²" type="number" min={0} value={Number.isFinite(m.pricePerM2) ? m.pricePerM2 : ''} onChange={(e) => edit((d) => (d.materials[i].pricePerM2 = toNum(e.target.value)))} />
              <input aria-label="Цвет образца" type="color" value={/^#[0-9a-f]{6}$/i.test(m.swatch) ? m.swatch : '#f4f2ee'} onChange={(e) => edit((d) => (d.materials[i].swatch = e.target.value))} />
              <button className="btn btn--ghost btn--small" onClick={() => edit((d) => d.materials.splice(i, 1))} disabled={cfg.services.some((s) => s.preset.materialId === m.id)} title="Нельзя удалить: используется в услуге">
                Удалить
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn--small" onClick={() => edit((d) => d.materials.push({ id: newId('mat'), name: 'Новое полотно', description: '', pricePerM2: 1000, enabled: false, swatch: '#f4f2ee' }))}>
          Добавить полотно
        </button>
      </Panel>

      <Panel title="Дополнительные работы">
        <p className="muted small">«По замеру» — клиент может выбрать опцию, она попадёт в заявку, но в сумму не входит.</p>
        <div className="admin-table">
          <div className="admin-table__head admin-row--extra">
            <span>Показ</span>
            <span>Название и описание</span>
            <span>Единица</span>
            <span>Ставка, ₽</span>
            <span>По замеру</span>
            <span />
          </div>
          {cfg.extras.map((x, i) => (
            <div className="admin-row admin-row--extra" key={x.id}>
              <Toggle label="" checked={x.enabled} onChange={(v) => edit((d) => (d.extras[i].enabled = v))} />
              <div className="admin-stack">
                <input aria-label="Название" value={x.label} onChange={(e) => edit((d) => (d.extras[i].label = e.target.value))} />
                <input aria-label="Описание" className="small" value={x.description} onChange={(e) => edit((d) => (d.extras[i].description = e.target.value))} />
              </div>
              <select aria-label="Единица" value={x.kind} onChange={(e) => edit((d) => (d.extras[i].kind = e.target.value as ExtraKind))}>
                <option value="piece">шт</option>
                <option value="meter">пог. м</option>
                <option value="area">м² (вся площадь)</option>
              </select>
              <input aria-label="Ставка" type="number" min={0} disabled={x.price === null} value={x.price === null || !Number.isFinite(x.price) ? '' : x.price} onChange={(e) => edit((d) => (d.extras[i].price = toNum(e.target.value)))} />
              <input aria-label="Цена по замеру" type="checkbox" checked={x.price === null} onChange={(e) => edit((d) => (d.extras[i].price = e.target.checked ? null : 0))} />
              <button
                className="btn btn--ghost btn--small"
                onClick={() => edit((d) => d.extras.splice(i, 1))}
                disabled={cfg.services.some((s) => s.preset.extras && x.id in s.preset.extras)}
                title="Нельзя удалить: используется в услуге"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn--small" onClick={() => edit((d) => d.extras.push({ id: newId('extra'), label: 'Новая работа', description: '', kind: 'piece', price: null, enabled: false }))}>
          Добавить работу
        </button>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ Тексты
const WHY_ICONS: [WhyItem['icon'], string][] = [
  ['receipt', 'Смета'],
  ['ruler', 'Замер'],
  ['clean', 'Чистота'],
  ['light', 'Свет'],
  ['clock', 'Сроки'],
  ['shield', 'Гарантия'],
];

function TextsTab({ cfg, edit }: { cfg: CompanyConfig; edit: EditFn }) {
  const t = cfg.texts;
  const T = (k: keyof CompanyConfig['texts'], label: string, area = false, rows = 3) =>
    area ? <Area label={label} value={t[k]} rows={rows} onChange={(v) => edit((d) => (d.texts[k] = v))} /> : <Text label={label} value={t[k]} onChange={(v) => edit((d) => (d.texts[k] = v))} />;
  return (
    <>
      <Panel title="Первый экран и заголовки">
        {T('heroTitle', 'Главный заголовок')}
        {T('heroSubtitle', 'Подзаголовок', true)}
        <div className="admin-grid">
          {T('servicesTitle', 'Заголовок «Услуги»')}
          {T('servicesSubtitle', 'Подзаголовок «Услуги»')}
          {T('whyTitle', 'Заголовок «Почему мы»')}
          {T('calcTitle', 'Заголовок калькулятора')}
          {T('calcSubtitle', 'Подзаголовок калькулятора')}
        </div>
        {T('measurementTerms', 'Условия выезда и замера', true)}
        {T('estimateNote', 'Примечание под расчётом', true, 2)}
        {T('successMessage', 'Сообщение после отправки заявки', true, 2)}
      </Panel>

      <Panel title="Почему мы">
        <p className="muted small">Пишите только то, что компания действительно выполняет: сроки и гарантии клиенты проверят.</p>
        {cfg.whyUs.map((w, i) => (
          <div className="admin-row admin-row--why" key={i}>
            <select aria-label="Иконка" value={w.icon} onChange={(e) => edit((d) => (d.whyUs[i].icon = e.target.value as WhyItem['icon']))}>
              {WHY_ICONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input aria-label="Заголовок" value={w.title} onChange={(e) => edit((d) => (d.whyUs[i].title = e.target.value))} />
            <input aria-label="Текст" value={w.text} onChange={(e) => edit((d) => (d.whyUs[i].text = e.target.value))} />
            <button className="btn btn--ghost btn--small" onClick={() => edit((d) => d.whyUs.splice(i, 1))}>
              Удалить
            </button>
          </div>
        ))}
        <button className="btn btn--small" onClick={() => edit((d) => d.whyUs.push({ icon: 'shield', title: 'Новый пункт', text: '' }))}>
          Добавить пункт
        </button>
      </Panel>

      <Panel title="Этапы работы">
        <PairList items={cfg.process} a="title" b="text" onChange={(fn) => edit((d) => fn(d.process))} add={{ title: 'Новый этап', text: '' }} />
      </Panel>

      <Panel title="Частые вопросы">
        <PairList items={cfg.faq} a="q" b="a" onChange={(fn) => edit((d) => fn(d.faq))} add={{ q: 'Вопрос?', a: 'Ответ.' }} />
      </Panel>

      <Panel title="Форма заявки и политика">
        <Area
          label="Варианты «Когда удобно связаться» (по одному в строке)"
          value={cfg.contactTimes.join('\n')}
          onChange={(v) => edit((d) => (d.contactTimes = v.split('\n').map((s) => s.trim()).filter(Boolean)))}
        />
        {T('privacyPolicy', 'Политика обработки персональных данных (страница #/privacy)', true, 10)}
      </Panel>
    </>
  );
}

function PairList<T extends Record<string, string>>({ items, a, b, onChange, add }: { items: T[]; a: keyof T; b: keyof T; onChange: (fn: (arr: T[]) => void) => void; add: T }) {
  return (
    <>
      {items.map((it, i) => (
        <div className="admin-row admin-row--pair" key={i}>
          <input aria-label="Заголовок" value={it[a]} onChange={(e) => onChange((arr) => ((arr[i] as Record<string, string>)[a as string] = e.target.value))} />
          <textarea aria-label="Текст" rows={2} value={it[b]} onChange={(e) => onChange((arr) => ((arr[i] as Record<string, string>)[b as string] = e.target.value))} />
          <div className="admin-row-inline">
            <button className="btn btn--ghost btn--small" onClick={() => onChange((arr) => move(arr, i, -1))} aria-label="Выше">
              ↑
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => onChange((arr) => arr.splice(i, 1))}>
              Удалить
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn--small" onClick={() => onChange((arr) => arr.push({ ...add }))}>
        Добавить
      </button>
    </>
  );
}

// ------------------------------------------------------------------ Компания
function CompanyTab({ cfg, edit }: { cfg: CompanyConfig; edit: EditFn }) {
  return (
    <>
      <Panel title="Компания">
        <Toggle label="Показывать плашку «Демо-версия» (выключите после замены данных)" checked={cfg.demoMode} onChange={(v) => edit((d) => (d.demoMode = v))} />
        <div className="admin-grid">
          <Text label="Название компании" value={cfg.brand.name} onChange={(v) => edit((d) => (d.brand.name = v))} />
          <Text label="Город" value={cfg.brand.city} onChange={(v) => edit((d) => (d.brand.city = v))} />
          <Text label="Телефон" value={cfg.contacts.phone} onChange={(v) => edit((d) => (d.contacts.phone = v))} />
          <Text label="E-mail" value={cfg.contacts.email} onChange={(v) => edit((d) => (d.contacts.email = v))} />
          <Text label="Адрес" value={cfg.contacts.address} onChange={(v) => edit((d) => (d.contacts.address = v))} />
          <Text label="Часы работы" value={cfg.contacts.workHours} onChange={(v) => edit((d) => (d.contacts.workHours = v))} />
        </div>
      </Panel>
      <Panel title="Логотип и фото">
        <div className="img-fields">
          <ImageField label="Логотип (PNG/SVG, прозрачный фон)" value={cfg.brand.logoUrl} fallback="room" onChange={(v) => edit((d) => (d.brand.logoUrl = v))} logo />
          <ImageField label="Фото первого экрана" value={cfg.images.hero} fallback="room" onChange={(v) => edit((d) => (d.images.hero = v))} />
          <ImageField label="Фото «Почему мы»" value={cfg.images.why} fallback="glossy" onChange={(v) => edit((d) => (d.images.why = v))} />
        </div>
      </Panel>
      <Panel title="Соцсети">
        <p className="muted small">Пустая ссылка — кнопка не показывается. Ссылка на Telegram вида https://t.me/имя также используется для ручной отправки заявки клиентом.</p>
        <div className="admin-grid">
          <Text label="ВКонтакте" placeholder="https://vk.com/ваша_группа" value={cfg.social.vk} onChange={(v) => edit((d) => (d.social.vk = v.trim()))} />
          <Text label="Telegram" placeholder="https://t.me/ваш_аккаунт" value={cfg.social.telegram} onChange={(v) => edit((d) => (d.social.telegram = v.trim()))} />
          <Text
            label="Instagram"
            placeholder="https://instagram.com/…"
            hint="Компания Meta признана в РФ экстремистской; размещение ссылки — на ваше усмотрение."
            value={cfg.social.instagram}
            onChange={(v) => edit((d) => (d.social.instagram = v.trim()))}
          />
          <Text label="WhatsApp" placeholder="https://wa.me/79000000000" value={cfg.social.whatsapp} onChange={(v) => edit((d) => (d.social.whatsapp = v.trim()))} />
        </div>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ Каналы
function ChannelsTab({ intg, editI, dirty }: { intg: MaskedIntegrations; editI: (fn: (d: MaskedIntegrations) => void) => void; dirty: boolean }) {
  const [test, setTest] = useState<{ busy: boolean; res?: { telegram: Delivery; vk: Delivery }; error?: string }>({ busy: false });
  const runTest = async () => {
    setTest({ busy: true });
    try {
      const r = await admin.testLead();
      setTest({ busy: false, res: r.channels });
    } catch (e) {
      setTest({ busy: false, error: (e as Error).message });
    }
  };
  return (
    <>
      <Panel title="Telegram">
        <Toggle label="Отправлять заявки в Telegram" checked={intg.telegram.enabled} onChange={(v) => editI((d) => (d.telegram.enabled = v))} />
        <div className="admin-grid">
          <Secret label="Токен бота" hint={intg.telegram.tokenHint} value={intg.telegram.botToken} onChange={(v) => editI((d) => (d.telegram.botToken = v))} />
          <Text label="Куда отправлять (chat id)" placeholder="@my_channel или -1001234567890" value={intg.telegram.chatId} onChange={(v) => editI((d) => (d.telegram.chatId = v))} />
        </div>
        <details className="howto">
          <summary>Как подключить за 3 минуты</summary>
          <ol>
            <li>В Telegram откройте @BotFather → /newbot → придумайте имя. Скопируйте токен вида 123456:ABC… в поле выше.</li>
            <li>Создайте канал или группу для заявок и добавьте бота администратором (право «Публикация сообщений»).</li>
            <li>В поле chat id укажите @имя публичного канала. Для закрытого канала или группы — числовой id вида -100…: перешлите любое сообщение из канала боту @getmyid_bot (или аналогу) и скопируйте id.</li>
            <li>Сохраните и нажмите «Отправить тестовую заявку» внизу.</li>
          </ol>
        </details>
      </Panel>

      <Panel title="ВКонтакте">
        <Toggle label="Отправлять заявки во ВКонтакте" checked={intg.vk.enabled} onChange={(v) => editI((d) => (d.vk.enabled = v))} />
        <div className="admin-grid">
          <Secret label="Ключ доступа сообщества" hint={intg.vk.tokenHint} value={intg.vk.groupToken} onChange={(v) => editI((d) => (d.vk.groupToken = v))} />
          <Text label="Кому отправлять (id через запятую)" placeholder="123456789, 2000000001" value={intg.vk.peerIds} onChange={(v) => editI((d) => (d.vk.peerIds = v))} />
        </div>
        <details className="howto">
          <summary>Как подключить</summary>
          <ol>
            <li>Управление сообществом → Сообщения → включите «Сообщения сообщества».</li>
            <li>Управление → Работа с API → Ключи доступа → Создать ключ с правом «Сообщения сообщества». Вставьте ключ выше.</li>
            <li>Каждый получатель (владелец, менеджеры) должен один раз написать сообществу любое сообщение — иначе ВК не разрешит писать ему.</li>
            <li>Укажите числовые id получателей (id страницы ВК). Для беседы сообщества — 2000000000 + номер беседы.</li>
            <li>Сохраните и отправьте тестовую заявку.</li>
          </ol>
        </details>
      </Panel>

      <Panel title="Проверка">
        <p className="muted small">Тест отправляет сообщение по сохранённым настройкам — даже если канал выключен.</p>
        <button className="btn btn--primary" onClick={runTest} disabled={test.busy || dirty} title={dirty ? 'Сначала сохраните изменения' : ''}>
          {test.busy ? 'Отправляем…' : 'Отправить тестовую заявку'}
        </button>
        {dirty && <p className="muted small">Сначала сохраните изменения.</p>}
        {test.error && <p className="field-error">{test.error}</p>}
        {test.res && (
          <ul className="test-res">
            {(['telegram', 'vk'] as const).map((k) => (
              <li key={k}>
                <Pill label={k === 'telegram' ? 'Telegram' : 'ВК'} d={test.res![k]} />
                {test.res![k].status === 'off' && <span className="muted small"> не настроен</span>}
                {test.res![k].error && <span className="field-error"> {test.res![k].error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function SecurityTab() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await admin.password(cur, next);
      setMsg({ ok: true, text: 'Пароль изменён. Остальные сеансы завершены.' });
      setCur('');
      setNext('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.errors.join(' ') : 'Ошибка' });
    }
  };
  return (
    <Panel title="Смена пароля">
      <form onSubmit={submit} className="admin-grid">
        <label className="field">
          <span className="field-label">Текущий пароль</span>
          <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Новый пароль (от 8 символов)</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <div>
          <button className="btn btn--primary" disabled={!cur || next.length < 8}>
            Сменить пароль
          </button>
        </div>
      </form>
      {msg && <p className={msg.ok ? 'ok-text' : 'field-error'}>{msg.text}</p>}
      <p className="muted small">Забыли пароль? На сервере выполните npm run set-password.</p>
    </Panel>
  );
}

// ------------------------------------------------------------------ Поля
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field-help">{hint}</span>}
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Num({ label, value, onChange, hint, disabled }: { label: string; value: number; onChange: (v: number) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" min={0} disabled={disabled} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(toNum(e.target.value))} />
      {hint && <span className="field-help">{hint}</span>}
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="admin-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label || 'Показывать'} />
      {label && <span>{label}</span>}
    </label>
  );
}

/** Секрет: прежнее значение не показывается. null — оставить как есть. */
function Secret({ label, hint, value, onChange }: { label: string; hint: string; value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        placeholder={hint ? `сохранён (${hint}) — введите новый, чтобы заменить` : 'не задан'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
      {hint && (
        <button type="button" className="link-btn small" onClick={() => onChange('')}>
          Удалить сохранённый
        </button>
      )}
      {value === '' && <span className="field-help">Будет удалён при сохранении</span>}
    </div>
  );
}

/** Картинка: предпросмотр, путь и загрузка файла на сервер (сжимается в браузере до 1920 px). */
function ImageField({ label, value, fallback, onChange, logo }: { label: string; value: string; fallback: IllustrationKind; onChange: (v: string) => void; logo?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError('Нужен JPG, PNG или WebP');
    setBusy(true);
    try {
      const data = await prepareImage(file, logo ? 600 : 1920, !!logo);
      const r = await admin.upload(data);
      onChange(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="img-field">
      <span className="field-label">{label}</span>
      <div className={`img-field__preview ${logo ? 'img-field__preview--logo' : ''}`}>
        {logo && !value ? <span className="muted small">текстовый логотип</span> : <Img src={value} alt="" fallback={fallback} className="img-field__img" />}
      </div>
      <input aria-label={`${label}: путь`} value={value} placeholder="/images/файл.jpg" onChange={(e) => onChange(e.target.value.trim())} />
      <label className="btn btn--small img-field__upload">
        {busy ? 'Загружаем…' : 'Загрузить файл'}
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

async function prepareImage(file: File, maxSide: number, keepPng: boolean): Promise<string> {
  const read = () =>
    new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => fail(new Error('Не удалось прочитать файл'));
      r.readAsDataURL(file);
    });
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return read();
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return read();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return keepPng && file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86);
}
