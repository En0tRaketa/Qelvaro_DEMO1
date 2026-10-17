const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** 12 345 ₽ (с неразрывным пробелом перед знаком рубля). */
export function rub(n: number): string {
  return `${nf.format(Math.round(n))} ₽`;
}

export function num(n: number): string {
  return nf.format(n);
}

/** 12 000–14 000 ₽ */
export function rubRange(low: number, high: number): string {
  if (low === high) return rub(low);
  return `${nf.format(low)}–${nf.format(high)} ₽`;
}

export function unitLabel(kind: 'piece' | 'meter' | 'area'): string {
  return kind === 'piece' ? 'шт' : kind === 'meter' ? 'пог. м' : 'м²';
}
