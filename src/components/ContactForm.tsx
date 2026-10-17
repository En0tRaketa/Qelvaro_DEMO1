import { useId, useMemo, useRef, useState } from 'react';
import type { PublicConfig } from '../config/types';
import type { CalcResult } from '../lib/pricing';
import { buildLeadMessage, type LeadInput } from '../lib/lead';
import { validateName, validatePhone } from '../lib/validation';
import { copyText, telegramLink } from '../lib/share';
import { ApiError, sendLead, type LeadResponse } from '../api';
import { SocialIcon } from './Icons';

type Calc = Pick<LeadInput, 'serviceId' | 'roomTypeId' | 'area' | 'materialId' | 'quantities'>;
type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; res: LeadResponse } | { kind: 'error'; errors: string[] };

export default function ContactForm({ config, result, calc }: { config: PublicConfig; result: CalcResult; calc: Calc }) {
  const uid = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactTime, setContactTime] = useState(config.contactTimes[0] ?? '');
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // ловушка для ботов
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const errors = { name: validateName(name), phone: validatePhone(phone), consent: consent ? null : 'Подтвердите согласие на обработку данных' };
  const message = useMemo(
    () => buildLeadMessage(config, { ...calc, name, phone, contactTime, comment }, result, status.kind === 'done' ? { id: status.res.id } : {}),
    [config, calc, name, phone, contactTime, comment, result, status],
  );
  const show = (k: keyof typeof errors) => submitted && errors[k];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name) return nameRef.current?.focus();
    if (errors.phone) return phoneRef.current?.focus();
    if (errors.consent) return;
    setStatus({ kind: 'sending' });
    try {
      const res = await sendLead({ ...calc, name, phone, contactTime, comment, consent, website });
      setStatus({ kind: 'done', res });
    } catch (err) {
      setStatus({ kind: 'error', errors: err instanceof ApiError ? err.errors : ['Не удалось отправить заявку'] });
    }
  };

  const copy = async () => setCopied(await copyText(message));
  const tgHref = telegramLink(config.social.telegram, message, window.location.href.split('#')[0]);

  // Ручная отправка: показываем, только если автоматическая не сработала.
  const manual = (
    <div className="manual">
      <p>Продублируйте заявку сами — текст уже готов:</p>
      <div className="manual__actions">
        <a className="btn btn--tg" href={tgHref} target="_blank" rel="noopener noreferrer">
          <SocialIcon name="telegram" size={18} /> Открыть в Telegram
        </a>
        {config.social.vk && (
          <a className="btn btn--vk" href={config.social.vk} target="_blank" rel="noopener noreferrer" onClick={copy}>
            <SocialIcon name="vk" size={18} /> Написать во ВКонтакте
          </a>
        )}
        <button type="button" className="btn btn--ghost" onClick={copy}>
          {copied ? 'Текст скопирован' : 'Скопировать текст'}
        </button>
      </div>
      <p className="muted small">
        В Telegram текст подставится сам — нажмите «Отправить». Во ВКонтакте вставьте скопированный текст. Или позвоните: <strong>{config.contacts.phone}</strong>
      </p>
    </div>
  );

  if (status.kind === 'done' && status.res.delivered) {
    return (
      <div className="contact contact--done" role="status">
        <div className="done-mark" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3>Заявка № {status.res.id} отправлена</h3>
        <p>{config.texts.successMessage}</p>
        <p className="muted small">Если удобнее, позвоните сами: {config.contacts.phone}</p>
      </div>
    );
  }

  return (
    <form className="contact" onSubmit={submit} noValidate>
      <h3>Заявка на замер</h3>
      <p className="contact__lead">Оставьте контакт — расчёт придёт менеджеру вместе с заявкой. {config.texts.measurementTerms}</p>

      <div className="contact__grid">
        <div className="field">
          <label htmlFor={`${uid}-name`}>Имя</label>
          <input ref={nameRef} id={`${uid}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!show('name')} />
          {show('name') && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-phone`}>Телефон</label>
          <input ref={phoneRef} id={`${uid}-phone`} type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 900 123-45-67" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!show('phone')} />
          {show('phone') && <p className="field-error">{errors.phone}</p>}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-time`}>Когда удобно связаться</label>
          <select id={`${uid}-time`} value={contactTime} onChange={(e) => setContactTime(e.target.value)}>
            {config.contactTimes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field field--wide">
          <label htmlFor={`${uid}-comment`}>
            Комментарий <span className="muted">— необязательно</span>
          </label>
          <textarea id={`${uid}-comment`} rows={3} maxLength={500} placeholder="Высота потолков, этаж, сроки ремонта…" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div className="hp" aria-hidden>
          <label>
            Сайт <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>
      </div>

      <label className={`consent ${show('consent') ? 'has-error' : ''}`}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Согласен на обработку персональных данных по{' '}
          <a href="#/privacy" target="_blank" rel="noopener">
            политике конфиденциальности
          </a>
        </span>
      </label>
      {show('consent') && <p className="field-error">{errors.consent}</p>}

      <div className="contact__actions">
        <button type="submit" className="btn btn--primary btn--lg" disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? (
            <>
              <span className="spinner" aria-hidden /> Отправляем…
            </>
          ) : (
            'Отправить заявку'
          )}
        </button>
      </div>
      <p className="contact__fine">Заявка с расчётом сразу придёт менеджеру{channelHint(config)}.</p>

      {status.kind === 'done' && !status.res.delivered && (
        <div className="notice notice--warn" role="alert">
          <strong>Заявка № {status.res.id} сохранена, но уведомление менеджеру не дошло</strong>
          {manual}
        </div>
      )}
      {status.kind === 'error' && (
        <div className="notice notice--error" role="alert">
          <strong>Заявка не отправлена</strong>
          <ul>
            {status.errors.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {manual}
        </div>
      )}

      <details className="preview">
        <summary>Посмотреть текст заявки</summary>
        <pre>{message}</pre>
      </details>
    </form>
  );
}

function channelHint(c: PublicConfig) {
  const ch = [c.leadChannels.telegram && 'Telegram', c.leadChannels.vk && 'ВКонтакте'].filter(Boolean);
  return ch.length ? ` в ${ch.join(' и ')}` : '';
}
