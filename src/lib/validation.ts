/** Разбор числа, введённого человеком: «18,5», « 20 », «7.25». */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validateArea(raw: string, maxArea: number): { value: number | null; error: string | null } {
  if (!raw.trim()) return { value: null, error: 'Укажите площадь помещения' };
  if (/^\s*-/.test(raw)) return { value: null, error: 'Площадь не может быть отрицательной' };
  const n = parseDecimal(raw);
  if (n === null) return { value: null, error: 'Введите число, например 18 или 18,5' };
  if (n < 1) return { value: null, error: 'Минимальная площадь — 1 м²' };
  if (n > maxArea) return { value: null, error: `Для площади больше ${maxArea} м² оставьте заявку на замер` };
  return { value: n, error: null };
}

export const MAX_PIECES = 100;
export const MAX_METERS = 300;

/** Количество штук (целое) или погонных метров (до 2 знаков). Пусто = 0. */
export function validateQuantity(raw: string, kind: 'piece' | 'meter'): { value: number | null; error: string | null } {
  if (!raw.trim()) return { value: 0, error: null };
  if (/^\s*-/.test(raw)) return { value: null, error: 'Не может быть отрицательным' };
  const n = parseDecimal(raw);
  if (n === null) return { value: null, error: kind === 'piece' ? 'Целое число' : 'Число, например 3,5' };
  if (kind === 'piece') {
    if (!Number.isInteger(n)) return { value: null, error: 'Только целое число' };
    if (n > MAX_PIECES) return { value: null, error: `Не больше ${MAX_PIECES}` };
  } else if (n > MAX_METERS) {
    return { value: null, error: `Не больше ${MAX_METERS} м` };
  }
  return { value: n, error: null };
}

/** Телефон РФ: 10 цифр после +7/8 или произвольный международный 10–15 цифр. */
export function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'Укажите телефон, чтобы мы могли связаться';
  if (!/^[\d\s()+\-]+$/.test(raw.trim())) return 'Телефон может содержать только цифры, пробелы, скобки, + и -';
  if (digits.length < 10 || digits.length > 15) return 'Проверьте номер: например +7 900 123-45-67';
  if (/^(7|8)/.test(digits) && digits.length !== 11 && digits.length !== 10) return 'Российский номер: 11 цифр, например +7 900 123-45-67';
  return null;
}

export function validateName(raw: string): string | null {
  const s = raw.trim();
  if (!s) return 'Как к вам обращаться?';
  if (s.length < 2) return 'Слишком короткое имя';
  if (s.length > 60) return 'Слишком длинное имя';
  return null;
}
