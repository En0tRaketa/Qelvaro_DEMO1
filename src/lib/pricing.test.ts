import { describe, expect, it } from 'vitest';
import { defaultConfig as company } from '../config/defaults';
import type { CompanyConfig } from '../config/types';
import { calculate, type CalcInput } from './pricing';
import { buildLeadMessage, parseLead, servicePriceLabel } from './lead';
import { telegramLink } from './share';
import { validateArea, validatePhone, validateQuantity } from './validation';
import { validateConfig, validateIntegrations, isSafeImagePath } from '../config/validate';

const cfg = (patch: (c: CompanyConfig) => void = () => {}): CompanyConfig => {
  const c = structuredClone(company);
  patch(c);
  return c;
};
const input = (p: Partial<CalcInput> = {}): CalcInput => ({
  roomTypeId: 'room',
  area: 20,
  materialId: 'matte',
  quantities: {},
  ...p,
});

describe('1. площадь × тип полотна', () => {
  it.each([
    ['matte', 14000, 12600, 15400],
    ['glossy', 15000, 13500, 16500],
    ['satin', 16000, 14400, 17600],
    ['fabric', 36000, 32400, 39600],
  ])('%s, 20 м²', (materialId, total, low, high) => {
    const r = calculate(cfg(), input({ materialId }));
    expect(r.canvasCost).toBe(total);
    expect(r.total).toBe(total);
    expect([r.rangeLow, r.rangeHigh]).toEqual([low, high]);
  });

  it('дробная площадь', () => {
    expect(calculate(cfg(), input({ area: 18.5 })).canvasCost).toBe(12950);
  });

  it('выключенный материал не считается', () => {
    expect(() => calculate(cfg((c) => (c.materials[3].enabled = false)), input({ materialId: 'fabric' }))).toThrow();
  });
});

describe('2. светильники', () => {
  it('добавление и удаление пересчитывает цену', () => {
    const c = cfg();
    expect(calculate(c, input({ quantities: { spotlights: 6 } })).total).toBe(17000);
    expect(calculate(c, input({ quantities: { spotlights: 6, chandeliers: 1 } })).total).toBe(17700);
    expect(calculate(c, input({ quantities: { spotlights: 0 } })).total).toBe(14000);
  });
});

describe('3. карнизы и демонтаж', () => {
  it('карниз за пог. м, демонтаж за м²', () => {
    const r = calculate(cfg(), input({ quantities: { cornice: 3.5, demolition: 1 } }));
    expect(r.extraLines.find((l) => l.extra.id === 'cornice')!.cost).toBe(1750);
    expect(r.extraLines.find((l) => l.extra.id === 'demolition')!.cost).toBe(3000);
    expect(r.extrasCost).toBe(4750);
    expect(r.total).toBe(18750);
  });
  it('опция «по замеру» не попадает в сумму', () => {
    const r = calculate(cfg(), input({ quantities: { curtainNiche: 3 } }));
    expect(r.extrasCost).toBe(0);
    expect(r.hasOnRequest).toBe(true);
    expect(r.total).toBe(14000);
  });
  it('выключенная опция игнорируется', () => {
    const r = calculate(cfg(), input({ quantities: { corners: 4 } }));
    expect(r.extraLines).toHaveLength(0);
  });
});

describe('4–5. минимальный заказ и диапазон', () => {
  it('применяется минимальный заказ', () => {
    const r = calculate(cfg(), input({ area: 5 }));
    expect(r.subtotal).toBe(3500);
    expect(r.minOrderApplied).toBe(true);
    expect(r.total).toBe(8000);
    expect(r.rangeLow).toBe(8000); // не ниже минимального заказа
    expect(r.rangeHigh).toBe(8800);
  });
  it('минимальный заказ 0 — не применяется', () => {
    const r = calculate(cfg((c) => (c.pricing.minOrder = 0)), input({ area: 5 }));
    expect(r.minOrderApplied).toBe(false);
    expect(r.total).toBe(3500);
  });
  it('диапазон фиксированной суммой', () => {
    const r = calculate(cfg((c) => (c.pricing.range = { mode: 'fixed', value: 1000 })), input());
    expect([r.rangeLow, r.rangeHigh]).toEqual([13000, 15000]);
  });
  it('границы округляются', () => {
    const r = calculate(cfg(), input({ area: 13.3 })); // 9310 → 8379..10241
    expect([r.rangeLow, r.rangeHigh]).toEqual([8300, 10300].map((v, i) => (i === 0 ? Math.max(8000, v) : v)));
  });
  it('коэффициенты — только явно заданные', () => {
    expect(calculate(cfg(), input()).coefficientLines).toHaveLength(0);
    const r = calculate(
      cfg((c) => (c.pricing.coefficients = [{ id: 'h', label: 'Высота > 3 м', factor: 1.1, enabled: true }])),
      input(),
    );
    expect(r.total).toBe(15400);
  });
});

describe('8. монтаж не начисляется дважды', () => {
  it('модель А: монтаж в ставке, отдельной строки нет', () => {
    const r = calculate(cfg((c) => (c.pricing.installationPerM2 = 300)), input());
    expect(r.installationCost).toBe(0);
    expect(r.total).toBe(14000);
  });
  it('модель Б: монтаж прибавляется один раз', () => {
    const r = calculate(
      cfg((c) => {
        c.pricing.model = 'separate';
        c.pricing.installationPerM2 = 300;
      }),
      input(),
    );
    expect(r.canvasCost).toBe(14000);
    expect(r.installationCost).toBe(6000);
    expect(r.total).toBe(20000);
  });
});

describe('6. валидация', () => {
  it('площадь', () => {
    expect(validateArea('', 500).error).toBeTruthy();
    expect(validateArea('0', 500).error).toBeTruthy();
    expect(validateArea('0,5', 500).error).toBeTruthy();
    expect(validateArea('-5', 500).error).toMatch(/отрицат/);
    expect(validateArea('abc', 500).error).toBeTruthy();
    expect(validateArea('1e3', 500).error).toBeTruthy();
    expect(validateArea('600', 500).error).toBeTruthy();
    expect(validateArea('18,5', 500).value).toBe(18.5);
    expect(validateArea('1', 500).value).toBe(1);
  });
  it('количество', () => {
    expect(validateQuantity('', 'piece').value).toBe(0);
    expect(validateQuantity('2.5', 'piece').error).toBeTruthy();
    expect(validateQuantity('-1', 'piece').error).toBeTruthy();
    expect(validateQuantity('101', 'piece').error).toBeTruthy();
    expect(validateQuantity('3,5', 'meter').value).toBe(3.5);
  });
  it('телефон', () => {
    expect(validatePhone('')).toBeTruthy();
    expect(validatePhone('123')).toBeTruthy();
    expect(validatePhone('+7 (900) 123-45-67')).toBeNull();
    expect(validatePhone('8 900 123 45 67')).toBeNull();
    expect(validatePhone('звоните')).toBeTruthy();
  });
  it('демо-конфиг валиден', () => {
    expect(validateConfig(company)).toEqual([]);
  });
});

describe('7. Заявка', () => {
  const c = cfg();
  const quantities = { spotlights: 6, chandeliers: 1, pipes: 2, cornice: 3.5, demolition: 1, shadowProfile: 18 };
  const r = calculate(c, input({ quantities }));
  const lead = { serviceId: 'svc-glossy', roomTypeId: 'kitchen', area: 20, materialId: 'matte', quantities, name: 'Анна', phone: '+7 900 123-45-67', contactTime: 'Вечером (17:00–20:00)', comment: '' };
  const msg = buildLeadMessage(c, lead, r, { id: '1017-AB12' });

  it('содержит все поля в нужном порядке', () => {
    const keys = ['Компания', 'Услуга с сайта', 'Помещение', 'Площадь', 'Материал', 'Модель цены', 'Количество светильников', 'Количество люстр', 'Количество труб', 'Карнизы', 'Демонтаж', 'Дополнительные опции', 'Стоимость полотна и монтажа', 'Стоимость дополнительных работ', 'Предварительная стоимость', 'Имя', 'Телефон', 'Удобное время связи', 'Комментарий клиента'];
    const lines = msg.split('\n');
    expect(lines[0]).toBe('НОВАЯ ЗАЯВКА НА НАТЯЖНОЙ ПОТОЛОК № 1017-AB12');
    let last = -1;
    for (const k of keys) {
      const idx = lines.findIndex((l: string) => l.startsWith(`${k}:`));
      expect(idx, k).toBeGreaterThan(last);
      last = idx;
    }
  });
  it('корректные значения', () => {
    expect(msg).toContain('Услуга с сайта: Глянцевый потолок');
    expect(msg).toContain('Помещение: Кухня');
    expect(msg).toContain('Количество светильников: 6');
    expect(msg).toContain('Карнизы: 3,5 пог. м');
    expect(msg).toMatch(/Демонтаж: да, 20 м² — 3\u00a0000/);
    expect(msg).toContain('Теневой профиль 18 пог. м (цена по замеру)');
    expect(msg).toContain('Предварительная стоимость: 20\u00a0700–25\u00a0400\u00a0₽ + опции по замеру');
    expect(msg).toContain('Комментарий клиента: нет');
  });

  it('parseLead: корректная заявка проходит, лишнее отбрасывается', () => {
    const { lead: l, errors } = parseLead(c, { ...lead, quantities: { ...quantities, hacker: 5, corners: 3 }, consent: true, name: '  Анна\u0007 ' });
    expect(errors).toEqual([]);
    expect(l!.name).toBe('Анна');
    expect(l!.quantities).not.toHaveProperty('hacker');
    expect(l!.quantities).not.toHaveProperty('corners'); // выключенная опция
  });
  it('parseLead: ошибки', () => {
    const bad = parseLead(c, { ...lead, area: 0, materialId: 'gold', quantities: { spotlights: 2.5, demolition: 3 }, phone: '12', consent: false, contactTime: 'ночью' });
    expect(bad.lead).toBeNull();
    expect(bad.errors.join(' ')).toMatch(/Площадь/);
    expect(bad.errors.join(' ')).toMatch(/Материал/);
    expect(bad.errors.join(' ')).toMatch(/Светильники/);
    expect(bad.errors.join(' ')).toMatch(/Демонтаж/);
    expect(bad.errors.join(' ')).toMatch(/согласие/);
    expect(bad.errors.join(' ')).toMatch(/время/);
  });
  it('сервер пересчитывает цену сам: цена из браузера игнорируется', () => {
    const { lead: l } = parseLead(c, { ...lead, consent: true, total: 1, price: 1 } as Record<string, unknown>);
    expect(l).not.toHaveProperty('total');
  });

  it('подпись цены на карточке услуги', () => {
    const svc = (id: string) => c.services.find((s) => s.id === id)!;
    expect(servicePriceLabel(c, svc('svc-matte'))).toBe('от 700 ₽/м²');
    expect(servicePriceLabel(c, svc('svc-shadow'))).toBe('цена по замеру');
    expect(servicePriceLabel(c, { ...svc('svc-matte'), priceOverride: 'от 650 ₽' })).toBe('от 650 ₽');
  });

  it('ссылки Telegram для ручной отправки', () => {
    expect(telegramLink('https://t.me/my_company', 'привет', 'https://x')).toBe('https://t.me/my_company?text=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
    expect(telegramLink('', 'a b', 'https://x.ru/')).toBe('https://t.me/share/url?url=https%3A%2F%2Fx.ru%2F&text=a%20b');
  });

  it('проверка настроек интеграций и путей', () => {
    expect(validateIntegrations({ telegram: { enabled: true, botToken: '', chatId: '' }, vk: { enabled: false, groupToken: '', peerIds: '' } }).length).toBeGreaterThan(0);
    expect(validateIntegrations({ telegram: { enabled: true, botToken: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatId: '@my_channel, -1001234567890' }, vk: { enabled: false, groupToken: '', peerIds: '' } })).toEqual([]);
    expect(isSafeImagePath('/images/hero.jpg')).toBe(true);
    expect(isSafeImagePath('/uploads/a-1.webp')).toBe(true);
    expect(isSafeImagePath('javascript:alert(1)')).toBe(false);
    expect(isSafeImagePath('/images/../data/auth.json')).toBe(false);
  });
});
