/**
 * Заявка: проверка данных и текст сообщения.
 * Используется и в браузере (предпросмотр, ручная отправка), и на сервере
 * (сервер пересчитывает цену сам и не доверяет тексту из браузера).
 */
import type { CompanyConfig } from '../config/types.ts';
import { activeExtras, activeMaterials, calculate, pricingModelLabel, type CalcResult } from './pricing.ts';
import { num, rub, rubRange, unitLabel } from './format.ts';
import { MAX_METERS, MAX_PIECES, validateName, validatePhone } from './validation.ts';

export interface LeadInput {
  serviceId: string;
  roomTypeId: string;
  area: number;
  materialId: string;
  quantities: Record<string, number>;
  name: string;
  phone: string;
  contactTime: string;
  comment: string;
  consent: boolean;
}

/** Убирает управляющие символы и обрезает длину. */
export function cleanText(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** Строгая проверка заявки. Возвращает нормализованные данные или список ошибок. */
export function parseLead(c: CompanyConfig, raw: Record<string, unknown>): { lead: LeadInput | null; errors: string[] } {
  const errors: string[] = [];
  const area = Number(raw.area);
  if (!Number.isFinite(area) || area < 1 || area > c.pricing.maxArea) errors.push('Площадь вне допустимого диапазона');
  const materialId = cleanText(raw.materialId, 64);
  if (!activeMaterials(c).some((m) => m.id === materialId)) errors.push('Материал не найден');
  const roomTypeId = cleanText(raw.roomTypeId, 64);
  if (!c.roomTypes.some((r) => r.id === roomTypeId)) errors.push('Тип помещения не найден');
  const serviceId = cleanText(raw.serviceId, 64);

  const quantities: Record<string, number> = {};
  const rawQ = (raw.quantities && typeof raw.quantities === 'object' ? raw.quantities : {}) as Record<string, unknown>;
  for (const e of activeExtras(c)) {
    const q = Number(rawQ[e.id] ?? 0);
    if (!Number.isFinite(q) || q < 0) {
      errors.push(`${e.label}: некорректное количество`);
      continue;
    }
    if (e.kind === 'piece' && (!Number.isInteger(q) || q > MAX_PIECES)) errors.push(`${e.label}: целое число до ${MAX_PIECES}`);
    if (e.kind === 'meter' && q > MAX_METERS) errors.push(`${e.label}: не больше ${MAX_METERS} м`);
    if (e.kind === 'area' && q !== 0 && q !== 1) errors.push(`${e.label}: да или нет`);
    if (q > 0) quantities[e.id] = Math.round(q * 100) / 100;
  }

  const name = cleanText(raw.name, 60);
  const phone = cleanText(raw.phone, 30);
  const nameErr = validateName(name);
  const phoneErr = validatePhone(phone);
  if (nameErr) errors.push(nameErr);
  if (phoneErr) errors.push(phoneErr);
  const contactTime = cleanText(raw.contactTime, 80);
  if (!c.contactTimes.includes(contactTime)) errors.push('Выберите удобное время связи');
  if (raw.consent !== true) errors.push('Нужно согласие на обработку персональных данных');

  if (errors.length) return { lead: null, errors };
  return {
    lead: { serviceId, roomTypeId, area: Math.round(area * 100) / 100, materialId, quantities, name, phone, contactTime, comment: cleanText(raw.comment, 500), consent: true },
    errors,
  };
}

export function calcForLead(c: CompanyConfig, lead: LeadInput): CalcResult {
  return calculate(c, { roomTypeId: lead.roomTypeId, area: lead.area, materialId: lead.materialId, quantities: lead.quantities });
}

const FIXED = ['spotlights', 'chandeliers', 'pipes', 'cornice', 'demolition'];

/** Текст заявки (формат из ТЗ). */
export function buildLeadMessage(c: CompanyConfig, lead: Omit<LeadInput, 'consent'>, r: CalcResult, opts: { id?: string; date?: Date } = {}): string {
  const line = (id: string) => r.extraLines.find((l) => l.extra.id === id);
  const count = (id: string) => num(line(id)?.qty ?? 0);
  const cornice = line('cornice');
  const demolition = line('demolition');
  const room = c.roomTypes.find((x) => x.id === lead.roomTypeId)?.label ?? lead.roomTypeId;
  const service = c.services.find((s) => s.id === lead.serviceId)?.title;

  const other = r.extraLines
    .filter((l) => !FIXED.includes(l.extra.id))
    .map((l) => `${l.extra.label}${l.extra.kind === 'area' ? '' : ` ${num(l.qty)} ${unitLabel(l.extra.kind)}`}${l.cost === null ? ' (цена по замеру)' : ` — ${rub(l.cost)}`}`);
  for (const k of r.coefficientLines) other.push(`${k.label} (×${k.factor})`);

  const canvas =
    r.installationCost > 0
      ? `${rub(r.canvasAndInstall)} (полотно ${rub(r.canvasCost)} + монтаж ${rub(r.installationCost)})`
      : `${rub(r.canvasAndInstall)} (${num(r.area)} м² × ${num(r.canvasRate)} ₽, монтаж включён)`;
  const total =
    rubRange(r.rangeLow, r.rangeHigh) + (r.minOrderApplied ? ` (применён минимальный заказ ${rub(r.minOrder)})` : '') + (r.hasOnRequest ? ' + опции по замеру' : '');
  const or = (s: string) => s.trim() || 'не указано';
  const date = opts.date ? opts.date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) + ' МСК' : '';

  return [
    `НОВАЯ ЗАЯВКА НА НАТЯЖНОЙ ПОТОЛОК${opts.id ? ` № ${opts.id}` : ''}`,
    '',
    `Компания: ${c.brand.name}, ${c.brand.city}`,
    ...(service ? [`Услуга с сайта: ${service}`] : []),
    `Помещение: ${room}`,
    `Площадь: ${num(r.area)} м²`,
    `Материал: ${r.material.name}`,
    `Модель цены: ${pricingModelLabel(c)}`,
    `Количество светильников: ${count('spotlights')}`,
    `Количество люстр: ${count('chandeliers')}`,
    `Количество труб: ${count('pipes')}`,
    `Карнизы: ${cornice ? num(cornice.qty) : 0} пог. м`,
    `Демонтаж: ${demolition ? `да, ${num(r.area)} м²${demolition.cost !== null ? ` — ${rub(demolition.cost)}` : ''}` : 'не нужен'}`,
    `Дополнительные опции: ${other.length ? other.join('; ') : 'нет'}`,
    `Стоимость полотна и монтажа: ${canvas}`,
    `Стоимость дополнительных работ: ${rub(r.extrasCost)}`,
    `Предварительная стоимость: ${total}`,
    `Имя: ${or(lead.name)}`,
    `Телефон: ${or(lead.phone)}`,
    `Удобное время связи: ${or(lead.contactTime)}`,
    `Комментарий клиента: ${lead.comment.trim() || 'нет'}`,
    ...(date ? ['', `Получено: ${date}`] : []),
  ].join('\n');
}

/** Подпись цены для карточки услуги: «от 700 ₽/м²», «500 ₽/пог. м» или «по замеру». */
export function servicePriceLabel(c: CompanyConfig, s: CompanyConfig['services'][number]): string {
  if (s.priceOverride.trim()) return s.priceOverride.trim();
  const extraIds = Object.keys(s.preset.extras ?? {});
  if (extraIds.length) {
    const e = c.extras.find((x) => x.id === extraIds[0]);
    if (e) return e.price === null ? 'цена по замеру' : `${num(e.price)} ₽/${unitLabel(e.kind)}`;
  }
  const m = c.materials.find((x) => x.id === s.preset.materialId);
  return m ? `от ${num(m.pricePerM2)} ₽/м²` : '';
}
