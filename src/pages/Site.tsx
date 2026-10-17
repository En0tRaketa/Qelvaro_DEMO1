import { useState } from 'react';
import type { PublicConfig, ServiceCard } from '../config/types';
import Calculator, { applyService, initialCalcState, useEstimate, type CalcState } from '../components/Calculator';
import Img from '../components/Img';
import { SocialIcon, WhyIcon, activeSocials } from '../components/Icons';
import { activeExtras, activeMaterials } from '../lib/pricing';
import { servicePriceLabel } from '../lib/lead';
import { num, rubRange, unitLabel } from '../lib/format';

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;

export default function Site({ config }: { config: PublicConfig }) {
  const [state, setState] = useState<CalcState>(() => initialCalcState(config));
  const [step, setStep] = useState(0);
  const est = useEstimate(config, state);
  const material = activeMaterials(config).find((m) => m.id === state.materialId);
  const room = config.roomTypes.find((r) => r.id === state.roomTypeId);
  const services = config.services.filter((s) => s.enabled);
  const socials = activeSocials(config.social);
  const cheapest = activeMaterials(config).reduce((a, m) => (m.pricePerM2 < a ? m.pricePerM2 : a), Infinity);

  const toCalc = () => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const pickService = (svc: ServiceCard) => {
    setState((s) => applyService(config, s, svc));
    setStep(est.area !== null ? 2 : 1);
    toCalc();
  };

  const chosenExtras = activeExtras(config).filter((e) => {
    const raw = state.qtyRaw[e.id] ?? '';
    return e.kind === 'area' ? raw === '1' : Number(raw.replace(',', '.')) > 0;
  });

  return (
    <>
      {config.demoMode && (
        <div className="demo-bar" role="note">
          Демо-версия: название, контакты и цены условные и не являются публичной офертой.
        </div>
      )}

      <header className="site-header">
        <div className="wrap site-header__in">
          <a href="#top" className="logo" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: 'smooth' }))}>
            {config.brand.logoUrl ? (
              <img src={config.brand.logoUrl} alt={config.brand.name} />
            ) : (
              <>
                <LogoMark />
                <span>
                  <strong>{config.brand.name}</strong>
                  <small>натяжные потолки · {config.brand.city}</small>
                </span>
              </>
            )}
          </a>
          <nav className="site-nav" aria-label="Разделы">
            <a href="#services">Услуги</a>
            <a href="#why">Почему мы</a>
            <a href="#calculator">Калькулятор</a>
            {config.faq.length > 0 && <a href="#faq">Вопросы</a>}
            <a href="#contacts">Контакты</a>
          </nav>
          <a className="site-header__phone" href={telHref(config.contacts.phone)}>
            {config.contacts.phone}
          </a>
          <button type="button" className="btn btn--primary btn--small site-header__cta" onClick={toCalc}>
            Рассчитать
          </button>
        </div>
      </header>

      <main id="top">
        {/* ---------- Первый экран ---------- */}
        <section className="hero">
          <div className="wrap hero__in">
            <div className="hero__text">
              <p className="hero__place">Натяжные потолки в г. {config.brand.city}</p>
              <h1>{config.texts.heroTitle}</h1>
              <p className="hero__sub">{config.texts.heroSubtitle}</p>
              <div className="hero__cta">
                <button type="button" className="btn btn--primary btn--lg" onClick={toCalc}>
                  Рассчитать стоимость
                </button>
                <a className="btn btn--ghost btn--lg" href="#services">
                  Смотреть услуги
                </a>
              </div>
              <ul className="hero__facts">
                <li>
                  <strong>{Number.isFinite(cheapest) ? `от ${num(cheapest)} ₽` : '—'}</strong>
                  <span>за м² {config.pricing.model === 'included' ? 'с монтажом' : 'полотна'}</span>
                </li>
                <li>
                  <strong>1 минута</strong>
                  <span>на расчёт без звонков</span>
                </li>
                <li>
                  <strong>{[config.leadChannels.telegram && 'Telegram', config.leadChannels.vk && 'ВК'].filter(Boolean).join(' + ') || 'Заявка'}</strong>
                  <span>заявка сразу менеджеру</span>
                </li>
              </ul>
            </div>
            <div className="hero__visual">
              <Img src={config.images.hero} alt="Натяжной потолок в интерьере" fallback="room" className="hero__img" eager />
              <div className="hero__badge" aria-hidden>
                <span className="hero__badge-dot" />
                <span>
                  <small>Расчёт с расшифровкой</small>
                  <strong>полотно · свет · карнизы</strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Услуги ---------- */}
        {services.length > 0 && (
          <section id="services" className="section">
            <div className="wrap">
              <div className="section__head">
                <h2>{config.texts.servicesTitle}</h2>
                <p>{config.texts.servicesSubtitle}</p>
              </div>
              <div className="services-grid">
                {services.map((s) => (
                  <article key={s.id} className={`svc ${state.serviceId === s.id ? 'is-on' : ''}`}>
                    <div className="svc__media">
                      <Img src={s.image} alt={s.title} fallback={s.illustration} className="svc__img" />
                    </div>
                    <div className="svc__body">
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                      <div className="svc__foot">
                        <span className="svc__price">{servicePriceLabel(config, s)}</span>
                        <button type="button" className="btn btn--primary btn--small" onClick={() => pickService(s)}>
                          Рассчитать
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Почему мы ---------- */}
        {config.whyUs.length > 0 && (
          <section id="why" className="section section--why">
            <div className="wrap why">
              <div className="why__media">
                <Img src={config.images.why} alt="Монтаж натяжного потолка" fallback="glossy" className="why__img" />
              </div>
              <div className="why__body">
                <h2>{config.texts.whyTitle}</h2>
                <ul className="why__list">
                  {config.whyUs.map((w) => (
                    <li key={w.title}>
                      <span className="why__icon">
                        <WhyIcon name={w.icon} />
                      </span>
                      <div>
                        <h3>{w.title}</h3>
                        <p>{w.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ---------- Этапы ---------- */}
        {config.process.length > 0 && (
          <section className="section section--process">
            <div className="wrap">
              <h2 className="process__title">Как проходит работа</h2>
              <ol className="process">
                {config.process.map((p, i) => (
                  <li key={p.title}>
                    <span className="process__n">{i + 1}</span>
                    <h3>{p.title}</h3>
                    <p>{p.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* ---------- Калькулятор ---------- */}
        <section id="calculator" className="section section--calc">
          <div className="wrap">
            <div className="section__head">
              <h2>{config.texts.calcTitle}</h2>
              <p>{config.texts.calcSubtitle}</p>
            </div>
            <div className="calc-layout">
              <Calculator config={config} state={state} setState={setState} step={step} setStep={setStep} />
              <aside className="ticket" aria-label="Текущий расчёт">
                <div className="ticket__tape" aria-hidden />
                <p className="ticket__title">Ваш расчёт</p>
                <dl className="ticket__list">
                  <div>
                    <dt>Помещение</dt>
                    <dd>{room?.label}</dd>
                  </div>
                  <div>
                    <dt>Площадь</dt>
                    <dd>{est.area !== null ? `${num(est.area)} м²` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Полотно</dt>
                    <dd>{material?.name ?? '—'}</dd>
                  </div>
                  {chosenExtras.map((e) => (
                    <div key={e.id}>
                      <dt>{e.label}</dt>
                      <dd>{e.kind === 'area' ? 'да' : `${state.qtyRaw[e.id]} ${unitLabel(e.kind)}`}</dd>
                    </div>
                  ))}
                </dl>
                <div className="ticket__total">
                  {est.result ? (
                    <>
                      <span>Предварительно</span>
                      <strong>{rubRange(est.result.rangeLow, est.result.rangeHigh)}</strong>
                      {est.result.minOrderApplied && <small>с учётом минимального заказа</small>}
                    </>
                  ) : (
                    <span className="ticket__empty">{Object.keys(est.qtyErrors).length ? 'Проверьте количество в расчёте' : 'Укажите площадь — здесь появится цена'}</span>
                  )}
                </div>
                {est.result && step < 4 && (
                  <button type="button" className="btn btn--dark btn--block" onClick={() => setStep(4)}>
                    Подробный расчёт
                  </button>
                )}
              </aside>
            </div>
          </div>
        </section>

        {/* ---------- Вопросы ---------- */}
        {config.faq.length > 0 && (
          <section id="faq" className="section section--faq">
            <div className="wrap faq">
              <h2>Частые вопросы</h2>
              <div className="faq__list">
                {config.faq.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Контакты и соцсети ---------- */}
        <section id="contacts" className="section section--contact">
          <div className="wrap">
            <div className="contact-band">
              <div>
                <h2>Остались вопросы?</h2>
                <p>{config.texts.measurementTerms}</p>
                <a className="contact-band__phone" href={telHref(config.contacts.phone)}>
                  {config.contacts.phone}
                </a>
                <p className="contact-band__meta">
                  {config.contacts.workHours}
                  <br />
                  {config.contacts.address}
                </p>
              </div>
              <div className="contact-band__side">
                {socials.length > 0 && (
                  <div className="socials">
                    {socials.map((s) => (
                      <a key={s.key} className={`social social--${s.key}`} href={s.url} target="_blank" rel="noopener noreferrer">
                        <SocialIcon name={s.key} size={22} />
                        <span>{s.label}</span>
                      </a>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn--primary btn--lg" onClick={toCalc}>
                  Рассчитать и оставить заявку
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap site-footer__in">
          <div>
            <strong className="site-footer__brand">{config.brand.name}</strong>
            <p>Натяжные потолки, г. {config.brand.city}</p>
          </div>
          {socials.length > 0 && (
            <div className="site-footer__socials">
              {socials.map((s) => (
                <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
                  <SocialIcon name={s.key} />
                </a>
              ))}
            </div>
          )}
          <ul className="site-footer__contacts">
            <li>
              <a href={telHref(config.contacts.phone)}>{config.contacts.phone}</a>
            </li>
            {config.contacts.email && (
              <li>
                <a href={`mailto:${config.contacts.email}`}>{config.contacts.email}</a>
              </li>
            )}
            <li>
              <a href="#/privacy">Политика конфиденциальности</a>
            </li>
          </ul>
        </div>
        <div className="wrap site-footer__fine">Расчёт на сайте ориентировочный и не является публичной офертой. Итоговая стоимость определяется после замера.</div>
      </footer>
    </>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1B2024" />
      <path d="M10 22 L32 12 L54 22" fill="none" stroke="#FF6A13" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="30" width="36" height="22" rx="3" fill="none" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}
