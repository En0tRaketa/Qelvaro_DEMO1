import type { CompanyConfig, Integrations } from './types.ts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Путь к картинке: пусто, /images/..., /uploads/... или https://... */
export function isSafeImagePath(p: string): boolean {
  return p === '' || /^\/(images|uploads)\/[\w.\-/]+$/.test(p) && !p.includes('..') || /^https:\/\/[^\s"'<>]+$/.test(p);
}
/** Ссылка соцсети: пусто или https:// */
export function isSafeUrl(p: string): boolean {
  return p === '' || /^https:\/\/[^\s"'<>]+$/.test(p);
}

/** Проверка настроек сайта (сервер перед записью, админка перед сохранением). */
export function validateConfig(c: CompanyConfig): string[] {
  const errors: string[] = [];
  const nonNeg = (v: unknown, label: string) => {
    if (!isNum(v) || v < 0) errors.push(`${label}: нужно число ≥ 0`);
  };
  if (!c || typeof c !== 'object') return ['Настройки повреждены'];

  if (!c.brand?.name?.trim()) errors.push('Название компании не заполнено');
  if (!c.brand?.city?.trim()) errors.push('Город не заполнен');
  for (const [k, v] of Object.entries({ Логотип: c.brand?.logoUrl, 'Фото первого экрана': c.images?.hero, 'Фото «Почему мы»': c.images?.why })) {
    if (!isStr(v) || !isSafeImagePath(v)) errors.push(`${k}: путь вида /images/файл.jpg, /uploads/… или https://…`);
  }
  for (const [k, v] of Object.entries(c.social ?? {})) {
    if (!isStr(v) || !isSafeUrl(v)) errors.push(`Ссылка ${k}: должна начинаться с https://`);
  }
  for (const [k, v] of Object.entries(c.texts ?? {})) {
    if (!isStr(v)) errors.push(`Текст ${k} повреждён`);
    else if (v.length > 5000) errors.push(`Текст ${k}: не длиннее 5000 символов`);
  }

  const p = c.pricing;
  if (!p) return [...errors, 'Блок цен отсутствует'];
  if (p.model !== 'included' && p.model !== 'separate') errors.push('Модель цены: included или separate');
  nonNeg(p.installationPerM2, 'Монтаж за м²');
  if (p.model === 'separate' && !(p.installationPerM2 > 0)) errors.push('В модели «монтаж отдельно» укажите стоимость монтажа за м²');
  nonNeg(p.minOrder, 'Минимальный заказ');
  if (p.range?.mode !== 'percent' && p.range?.mode !== 'fixed') errors.push('Диапазон: проценты или рубли');
  nonNeg(p.range?.value, 'Ширина диапазона');
  if (p.range?.mode === 'percent' && p.range.value >= 100) errors.push('Диапазон в процентах должен быть меньше 100');
  if (!isNum(p.roundTo) || p.roundTo < 1) errors.push('Округление: число ≥ 1');
  if (!isNum(p.maxArea) || p.maxArea < 1) errors.push('Максимальная площадь: число ≥ 1');
  for (const k of p.coefficients ?? []) {
    if (!isNum(k.factor) || k.factor <= 0) errors.push(`Коэффициент «${k.label}»: множитель > 0`);
  }

  const matIds = new Set<string>();
  if (!(c.materials ?? []).some((m) => m.enabled)) errors.push('Включите хотя бы один материал');
  for (const m of c.materials ?? []) {
    if (!m.id || matIds.has(m.id)) errors.push(`Материал «${m.name}»: id пустой или повторяется`);
    matIds.add(m.id);
    if (!m.name?.trim()) errors.push('У материала нет названия');
    if (!isNum(m.pricePerM2) || m.pricePerM2 <= 0) errors.push(`Материал «${m.name}»: ставка за м² > 0`);
  }
  const extraIds = new Set<string>();
  for (const e of c.extras ?? []) {
    if (!e.id || extraIds.has(e.id)) errors.push(`Доп. работа «${e.label}»: id пустой или повторяется`);
    extraIds.add(e.id);
    if (!['piece', 'meter', 'area'].includes(e.kind)) errors.push(`Доп. работа «${e.label}»: неизвестная единица`);
    if (e.price !== null && (!isNum(e.price) || e.price < 0)) errors.push(`Доп. работа «${e.label}»: ставка ≥ 0 или «по замеру»`);
  }
  const svcIds = new Set<string>();
  for (const s of c.services ?? []) {
    if (!s.id || svcIds.has(s.id)) errors.push(`Услуга «${s.title}»: id пустой или повторяется`);
    svcIds.add(s.id);
    if (!s.title?.trim()) errors.push('У услуги нет названия');
    if (!isSafeImagePath(s.image ?? '')) errors.push(`Услуга «${s.title}»: некорректный путь к картинке`);
    if (s.preset?.materialId && !matIds.has(s.preset.materialId)) errors.push(`Услуга «${s.title}»: материал не найден`);
    for (const [id, q] of Object.entries(s.preset?.extras ?? {})) {
      if (!extraIds.has(id)) errors.push(`Услуга «${s.title}»: доп. работа ${id} не найдена`);
      if (!isNum(q) || q < 0) errors.push(`Услуга «${s.title}»: количество ≥ 0`);
    }
  }
  if (!c.roomTypes?.length) errors.push('Нужен хотя бы один тип помещения');
  if (!c.contactTimes?.length) errors.push('Нужен хотя бы один вариант времени связи');
  return errors;
}

export function validateIntegrations(i: Integrations): string[] {
  const errors: string[] = [];
  const tg = i.telegram;
  if (tg.botToken && !/^\d{5,15}:[\w-]{30,}$/.test(tg.botToken)) errors.push('Telegram: токен бота выглядит неверно (формат 123456:ABC…)');
  if (tg.chatId && !tg.chatId.split(',').every((x) => /^(@[A-Za-z][\w]{4,31}|-?\d{3,20})$/.test(x.trim()))) {
    errors.push('Telegram: chat id — @имя_канала, -100… или число; несколько через запятую');
  }
  if (tg.enabled && (!tg.botToken || !tg.chatId)) errors.push('Telegram включён, но не заполнены токен или chat id');
  const vk = i.vk;
  if (vk.peerIds && !vk.peerIds.split(',').every((x) => /^\d{1,12}$/.test(x.trim()))) errors.push('ВК: id получателей — числа через запятую');
  if (vk.groupToken && vk.groupToken.length < 30) errors.push('ВК: ключ доступа сообщества слишком короткий');
  if (vk.enabled && (!vk.groupToken || !vk.peerIds)) errors.push('ВК включён, но не заполнены ключ доступа или получатели');
  return errors;
}
