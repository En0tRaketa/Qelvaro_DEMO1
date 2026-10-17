/**
 * Типы настроек. Значения хранятся на сервере в data/settings.json
 * (при первом запуске копируются из src/config/defaults.ts) и меняются в админке.
 */

/**
 * Модель цены:
 *  - "included" (Модель А): ставка полотна за м² уже включает стандартный монтаж.
 *  - "separate" (Модель Б): монтаж = площадь × installationPerM2, отдельной строкой.
 */
export type PricingModel = 'included' | 'separate';

/** piece — штуки; meter — погонные метры; area — галочка, стоимость = площадь × ставка. */
export type ExtraKind = 'piece' | 'meter' | 'area';

export interface Material {
  id: string;
  name: string;
  description: string;
  /** ₽ за м². */
  pricePerM2: number;
  enabled: boolean;
  /** Цвет образца (CSS). */
  swatch: string;
  glossy?: boolean;
}

export interface Extra {
  id: string;
  label: string;
  description: string;
  kind: ExtraKind;
  /** ₽ за единицу; null — «по замеру»: попадает в заявку, в сумму не входит. */
  price: number | null;
  enabled: boolean;
}

export interface Coefficient {
  id: string;
  label: string;
  factor: number;
  enabled: boolean;
}

export interface RoomType {
  id: string;
  label: string;
  /** Пояснение клиенту. Цену не меняет. */
  hint: string;
  suggestedExtras: string[];
}

/** Вид иллюстрации-заглушки, пока владелец не добавил фото. */
export type IllustrationKind = 'matte' | 'glossy' | 'satin' | 'fabric' | 'shadow' | 'lines' | 'demolition' | 'room';

/** Карточка услуги на лендинге. Кнопка карточки подставляет preset в калькулятор. */
export interface ServiceCard {
  id: string;
  title: string;
  text: string;
  /** Путь к картинке: /images/... (папка public) или /uploads/... (загружено в админке). */
  image: string;
  illustration: IllustrationKind;
  /** Пусто — цена считается автоматически из тарифов («от 700 ₽/м²»). */
  priceOverride: string;
  enabled: boolean;
  preset: {
    materialId?: string;
    /** id доп. работы → количество (для area: 1). */
    extras?: Record<string, number>;
  };
}

export interface WhyItem {
  icon: 'ruler' | 'clean' | 'receipt' | 'clock' | 'shield' | 'light';
  title: string;
  text: string;
}

export interface ProcessStep {
  title: string;
  text: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface CompanyConfig {
  /** Плашка «Демо-версия» вверху сайта. */
  demoMode: boolean;
  brand: {
    name: string;
    city: string;
    logoUrl: string;
  };
  images: {
    hero: string;
    why: string;
  };
  contacts: {
    phone: string;
    email: string;
    address: string;
    workHours: string;
  };
  /** Ссылки на соцсети. Пустая ссылка — иконка не показывается. */
  social: {
    vk: string;
    telegram: string;
    instagram: string;
    whatsapp: string;
  };
  texts: {
    heroTitle: string;
    heroSubtitle: string;
    servicesTitle: string;
    servicesSubtitle: string;
    whyTitle: string;
    calcTitle: string;
    calcSubtitle: string;
    measurementTerms: string;
    estimateNote: string;
    successMessage: string;
    privacyPolicy: string;
  };
  pricing: {
    model: PricingModel;
    installationPerM2: number;
    /** 0 — не применять. */
    minOrder: number;
    range: { mode: 'percent' | 'fixed'; value: number };
    roundTo: number;
    maxArea: number;
    coefficients: Coefficient[];
  };
  materials: Material[];
  extras: Extra[];
  roomTypes: RoomType[];
  services: ServiceCard[];
  whyUs: WhyItem[];
  process: ProcessStep[];
  faq: FaqItem[];
  contactTimes: string[];
}

/** Секреты и каналы доставки заявок. Хранятся только на сервере, в браузер не отдаются. */
export interface Integrations {
  telegram: {
    enabled: boolean;
    botToken: string;
    /** @channelname, -100… (канал/группа) или id пользователя. Можно несколько через запятую. */
    chatId: string;
  };
  vk: {
    enabled: boolean;
    /** Ключ доступа сообщества с правом «Сообщения сообщества». */
    groupToken: string;
    /** id получателей (админов) или 2000000000+N для беседы. Через запятую. */
    peerIds: string;
  };
}

export interface Settings {
  config: CompanyConfig;
  integrations: Integrations;
}

/** То, что сервер отдаёт браузеру: настройки сайта + какие каналы включены (без токенов). */
export interface PublicConfig extends CompanyConfig {
  leadChannels: { telegram: boolean; vk: boolean };
}
