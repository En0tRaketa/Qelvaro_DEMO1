import type { CompanyConfig, Extra, Material } from '../config/types.ts';

export interface CalcInput {
  roomTypeId: string;
  /** Площадь, м² (уже проверенная, ≥ 1). */
  area: number;
  materialId: string;
  /** id доп. работы → количество (шт / пог. м); для kind "area": 1 = нужно, 0 = нет. */
  quantities: Record<string, number>;
}

export interface ExtraLine {
  extra: Extra;
  /** Количество в единицах опции (для "area" — площадь). */
  qty: number;
  /** Стоимость, ₽; null — уточняется на замере. */
  cost: number | null;
}

export interface CoefficientLine {
  label: string;
  factor: number;
  delta: number;
}

export interface CalcResult {
  area: number;
  material: Material;
  canvasRate: number;
  /** Полотно: площадь × ставка материала. */
  canvasCost: number;
  /** Монтаж: 0 в модели «included» (уже в ставке полотна). */
  installationCost: number;
  canvasAndInstall: number;
  extraLines: ExtraLine[];
  extrasCost: number;
  coefficientLines: CoefficientLine[];
  /** Сумма до применения минимального заказа. */
  subtotal: number;
  minOrder: number;
  minOrderApplied: boolean;
  /** Ориентировочная стоимость (центр диапазона). */
  total: number;
  rangeLow: number;
  rangeHigh: number;
  /** Есть опции с ценой «по замеру». */
  hasOnRequest: boolean;
}

const round = (n: number) => Math.round(n);

export function activeMaterials(c: CompanyConfig) {
  return c.materials.filter((m) => m.enabled);
}

export function activeExtras(c: CompanyConfig) {
  return c.extras.filter((e) => e.enabled);
}

/**
 * Расчёт предварительной стоимости.
 *
 *   полотно        = площадь × ставка материала
 *   монтаж         = площадь × ставка монтажа  (только модель "separate";
 *                                               в модели "included" монтаж уже в ставке полотна)
 *   доп. работы    = Σ количество × ставка  (для демонтажа: площадь × ставка)
 *   сумма          = (полотно + монтаж + доп. работы) × коэффициенты владельца (если заданы)
 *   итог           = max(сумма, минимальный заказ)
 *   диапазон       = итог ± value% (или ± value ₽), нижняя граница не ниже минимального заказа
 */
export function calculate(c: CompanyConfig, input: CalcInput): CalcResult {
  const material = activeMaterials(c).find((m) => m.id === input.materialId);
  if (!material) throw new Error(`Материал не найден или выключен: ${input.materialId}`);
  if (!(input.area >= 1)) throw new Error('Площадь должна быть не меньше 1 м²');

  const area = input.area;
  const canvasCost = round(area * material.pricePerM2);
  const installationCost = c.pricing.model === 'separate' ? round(area * c.pricing.installationPerM2) : 0;
  const canvasAndInstall = canvasCost + installationCost;

  const extraLines: ExtraLine[] = [];
  for (const extra of activeExtras(c)) {
    const raw = input.quantities[extra.id] ?? 0;
    if (!(raw > 0)) continue;
    const qty = extra.kind === 'area' ? area : raw;
    const cost = extra.price === null ? null : round(qty * extra.price);
    extraLines.push({ extra, qty, cost });
  }
  const extrasCost = extraLines.reduce((s, l) => s + (l.cost ?? 0), 0);

  let subtotal = canvasAndInstall + extrasCost;
  const coefficientLines: CoefficientLine[] = [];
  for (const k of c.pricing.coefficients.filter((k) => k.enabled && k.factor !== 1)) {
    const next = round(subtotal * k.factor);
    coefficientLines.push({ label: k.label, factor: k.factor, delta: next - subtotal });
    subtotal = next;
  }

  const minOrder = Math.max(0, c.pricing.minOrder);
  const minOrderApplied = minOrder > 0 && subtotal < minOrder;
  const total = minOrderApplied ? minOrder : subtotal;

  const spread = c.pricing.range.mode === 'percent' ? (total * c.pricing.range.value) / 100 : c.pricing.range.value;
  const step = Math.max(1, c.pricing.roundTo);
  let rangeLow = Math.floor((total - spread) / step) * step;
  const rangeHigh = Math.ceil((total + spread) / step) * step;
  if (minOrder > 0 && rangeLow < minOrder) rangeLow = minOrder;
  if (rangeLow < 0) rangeLow = 0;

  return {
    area,
    material,
    canvasRate: material.pricePerM2,
    canvasCost,
    installationCost,
    canvasAndInstall,
    extraLines,
    extrasCost,
    coefficientLines,
    subtotal,
    minOrder,
    minOrderApplied,
    total,
    rangeLow,
    rangeHigh,
    hasOnRequest: extraLines.some((l) => l.cost === null),
  };
}

export function pricingModelLabel(c: CompanyConfig): string {
  return c.pricing.model === 'included'
    ? 'Цена за м² включает стандартный монтаж'
    : `Монтаж отдельно: ${c.pricing.installationPerM2} ₽/м²`;
}
