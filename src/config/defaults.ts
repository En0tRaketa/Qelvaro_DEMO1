/*
 * ============================================================
 *  НАСТРОЙКИ ПО УМОЛЧАНИЮ (демо). Копируются в data/settings.json
 *  при первом запуске сервера; дальше всё меняется в админке.
 * ============================================================
 *  ⚠ ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ: бренд «Потолок Профи», город «Казань»,
 *  контакты, ВСЕ ставки, тексты «Почему мы» — условные.
 *  Ставки не являются рыночным прайсом. Перед продажей замените их.
 */
import type { CompanyConfig, Integrations } from './types.ts';

export const defaultConfig: CompanyConfig = {
  demoMode: true,
  brand: { name: 'Потолок Профи', city: 'Казань', logoUrl: '' },
  images: { hero: '/images/hero.jpg', why: '/images/why-us.jpg' },
  contacts: {
    phone: '+7 (000) 000-00-00',
    email: 'info@example.com',
    address: 'г. Казань (демо-адрес)',
    workHours: 'Ежедневно 9:00–20:00',
  },
  // Демо-ссылки ведут на главные страницы соцсетей — замените на свои.
  social: { vk: 'https://vk.com/', telegram: 'https://t.me/', instagram: 'https://instagram.com/', whatsapp: '' },
  texts: {
    heroTitle: 'Натяжные потолки с ценой до замера',
    heroSubtitle:
      'Выберите полотно, укажите площадь и светильники — калькулятор сразу покажет стоимость с расшифровкой. Заявка на замер уходит нам за пару секунд.',
    servicesTitle: 'Что мы делаем',
    servicesSubtitle: 'Нажмите «Рассчитать» на карточке — услуга сразу подставится в калькулятор.',
    whyTitle: 'Почему выбирают нас',
    calcTitle: 'Расчёт стоимости',
    calcSubtitle: 'Пять коротких шагов. Телефон для расчёта не нужен.',
    measurementTerms:
      'Замерщик приезжает в удобное время, делает точные замеры и называет итоговую стоимость. Условия выезда (стоимость, зона обслуживания) уточняйте у менеджера.',
    estimateNote: 'Это ориентировочный расчёт. Итог зависит от замера и условий монтажа. Точную стоимость подтвердим после замера.',
    successMessage: 'Заявка у нас. Менеджер свяжется с вами в выбранное время, чтобы договориться о замере.',
    privacyPolicy:
      'ШАБЛОН — замените текстом вашей политики обработки персональных данных.\n\nОператор: [наименование, ИНН, адрес].\n\nКакие данные собираем: имя, телефон, параметры помещения и комментарий, которые вы указываете в заявке.\n\nЗачем: чтобы связаться с вами, рассчитать стоимость и договориться о замере.\n\nСрок хранения: [срок]. Данные не передаются третьим лицам, кроме сервисов доставки уведомлений (Telegram, ВКонтакте), через которые заявка поступает менеджеру.\n\nОтозвать согласие: напишите на [e-mail].',
  },
  pricing: {
    model: 'included',
    installationPerM2: 0,
    minOrder: 8000,
    range: { mode: 'percent', value: 10 },
    roundTo: 100,
    maxArea: 500,
    coefficients: [],
  },
  materials: [
    { id: 'matte', name: 'Матовый ПВХ', description: 'Похож на идеально ровный окрашенный потолок. Подходит для любых комнат.', pricePerM2: 700, enabled: true, swatch: '#f4f2ee' },
    { id: 'glossy', name: 'Глянцевый ПВХ', description: 'Отражает свет и визуально увеличивает высоту помещения.', pricePerM2: 750, enabled: true, swatch: '#eef2f6', glossy: true },
    { id: 'satin', name: 'Сатиновый ПВХ', description: 'Мягкий перламутровый блеск — между матом и глянцем.', pricePerM2: 800, enabled: true, swatch: '#f6f1ea', glossy: true },
    { id: 'fabric', name: 'Тканевый потолок', description: 'Фактура ткани, бесшовное полотно на больших площадях.', pricePerM2: 1800, enabled: true, swatch: '#ece6dc' },
  ],
  extras: [
    { id: 'spotlights', label: 'Светильники', description: 'Точечные светильники: закладная и установка', kind: 'piece', price: 500, enabled: true },
    { id: 'chandeliers', label: 'Люстры', description: 'Закладная под люстру и подвес', kind: 'piece', price: 700, enabled: true },
    { id: 'pipes', label: 'Обход труб', description: 'Обвод трубы отопления или стояка', kind: 'piece', price: 300, enabled: true },
    { id: 'cornice', label: 'Карнизы', description: 'Установка потолочного карниза', kind: 'meter', price: 500, enabled: true },
    { id: 'curtainNiche', label: 'Ниша под карниз', description: 'Скрытая ниша для штор', kind: 'meter', price: null, enabled: true },
    { id: 'shadowProfile', label: 'Теневой профиль', description: 'Зазор между стеной и потолком вместо плинтуса', kind: 'meter', price: null, enabled: true },
    { id: 'lightLines', label: 'Световые линии', description: 'Встроенные светодиодные линии в полотне', kind: 'meter', price: null, enabled: true },
    { id: 'corners', label: 'Дополнительные углы', description: 'Углы сверх четырёх, если компания применяет такой тариф', kind: 'piece', price: null, enabled: false },
    { id: 'demolition', label: 'Демонтаж старого потолка', description: 'Снятие старого натяжного полотна', kind: 'area', price: 150, enabled: true },
  ],
  roomTypes: [
    { id: 'room', label: 'Комната', hint: 'Для спальни и гостиной чаще выбирают матовое или сатиновое полотно.', suggestedExtras: ['spotlights', 'chandeliers', 'cornice'] },
    { id: 'kitchen', label: 'Кухня', hint: 'На кухне часто нужен обход трубы и больше света над рабочей зоной.', suggestedExtras: ['spotlights', 'pipes'] },
    { id: 'bathroom', label: 'Ванная', hint: 'ПВХ-полотна не боятся влаги. В ванной обычно ставят точечные светильники.', suggestedExtras: ['spotlights', 'pipes'] },
    { id: 'corridor', label: 'Коридор', hint: 'В коридоре часто много углов — точное количество посчитает замерщик.', suggestedExtras: ['spotlights'] },
    { id: 'apartment', label: 'Вся квартира', hint: 'Укажите суммарную площадь всех помещений. Разбивку по комнатам сделаем на замере.', suggestedExtras: ['spotlights', 'chandeliers', 'pipes', 'cornice'] },
    { id: 'other', label: 'Другое', hint: 'Опишите помещение в комментарии к заявке — подскажем подходящий вариант.', suggestedExtras: [] },
  ],
  services: [
    { id: 'svc-matte', title: 'Матовый потолок', text: 'Ровный, без бликов — как свежая покраска. Самый частый выбор для спален и гостиных.', image: '/images/service-matte.jpg', illustration: 'matte', priceOverride: '', enabled: true, preset: { materialId: 'matte' } },
    { id: 'svc-glossy', title: 'Глянцевый потолок', text: 'Отражает свет и делает комнату выше. Хорошо смотрится в небольших помещениях.', image: '/images/service-glossy.jpg', illustration: 'glossy', priceOverride: '', enabled: true, preset: { materialId: 'glossy' } },
    { id: 'svc-satin', title: 'Сатиновый потолок', text: 'Мягкий перламутровый отлив без зеркального эффекта.', image: '/images/service-satin.jpg', illustration: 'satin', priceOverride: '', enabled: true, preset: { materialId: 'satin' } },
    { id: 'svc-fabric', title: 'Тканевый потолок', text: 'Фактура ткани и бесшовное полотно для больших залов.', image: '/images/service-fabric.jpg', illustration: 'fabric', priceOverride: '', enabled: true, preset: { materialId: 'fabric' } },
    { id: 'svc-shadow', title: 'Теневой профиль', text: 'Аккуратный зазор у стены вместо плинтуса — потолок как будто парит.', image: '/images/service-shadow.jpg', illustration: 'shadow', priceOverride: '', enabled: true, preset: { materialId: 'matte', extras: { shadowProfile: 16 } } },
    { id: 'svc-lines', title: 'Световые линии', text: 'Светодиодные линии прямо в полотне — основной или декоративный свет.', image: '/images/service-lines.jpg', illustration: 'lines', priceOverride: '', enabled: true, preset: { materialId: 'matte', extras: { lightLines: 6 } } },
  ],
  whyUs: [
    { icon: 'receipt', title: 'Цена понятна заранее', text: 'Калькулятор показывает расшифровку по каждой позиции. Скрытых доплат в расчёте нет.' },
    { icon: 'ruler', title: 'Замер с образцами', text: 'Замерщик привозит образцы полотен и составляет смету на месте.' },
    { icon: 'clean', title: 'Аккуратный монтаж', text: 'Защищаем мебель и пол, после работы убираем за собой.' },
    { icon: 'light', title: 'Свет под ключ', text: 'Светильники, люстры, световые линии и карнизы ставим в тот же день.' },
  ],
  process: [
    { title: 'Заявка', text: 'Рассчитайте стоимость и отправьте заявку — она сразу придёт менеджеру.' },
    { title: 'Замер', text: 'Замерщик приезжает, уточняет размеры и называет точную цену.' },
    { title: 'Изготовление', text: 'Раскраиваем полотно по вашим размерам.' },
    { title: 'Монтаж', text: 'Устанавливаем профиль, полотно и свет. Обычно комната — за один день.' },
  ],
  faq: [
    { q: 'Цена в калькуляторе окончательная?', a: 'Нет, это ориентировочный расчёт. Точную стоимость замерщик назовёт на объекте после замера.' },
    { q: 'Нужно ли выносить мебель?', a: 'Не обязательно. Достаточно освободить доступ к стенам — остальное мы накроем плёнкой.' },
    { q: 'Сколько длится монтаж?', a: 'Зависит от площади и количества светильников. Точный срок назовём после замера.' },
  ],
  contactTimes: ['В любое время', 'Утром (9:00–12:00)', 'Днём (12:00–17:00)', 'Вечером (17:00–20:00)', 'Только написать в мессенджер'],
};

export const defaultIntegrations: Integrations = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  vk: { enabled: false, groupToken: '', peerIds: '' },
};
