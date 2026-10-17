import { useMemo, useRef, useState } from 'react';
import type { Extra, PublicConfig, ServiceCard } from '../config/types';
import { activeExtras, activeMaterials, calculate, pricingModelLabel, type CalcResult } from '../lib/pricing';
import { num, rub, rubRange, unitLabel } from '../lib/format';
import { MAX_PIECES, validateArea, validateQuantity } from '../lib/validation';
import ContactForm from './ContactForm';

export interface CalcState {
  /** Услуга, выбранная на карточке (для заявки). */
  serviceId: string;
  roomTypeId: string;
  areaRaw: string;
  materialId: string;
  /** Сырые значения полей количества (строки, как ввёл клиент). */
  qtyRaw: Record<string, string>;
}

export function initialCalcState(c: PublicConfig): CalcState {
  return {
    serviceId: '',
    roomTypeId: c.roomTypes[0]?.id ?? 'room',
    areaRaw: '',
    materialId: activeMaterials(c)[0]?.id ?? '',
    qtyRaw: {},
  };
}

const STEPS = ['Помещение', 'Площадь и полотно', 'Свет и трубы', 'Карнизы и доп. работы', 'Результат'];

/** Подставить услугу с карточки: материал и доп. работы. Площадь и помещение не трогаем. */
export function applyService(c: PublicConfig, s: CalcState, svc: ServiceCard): CalcState {
  const qtyRaw: Record<string, string> = { ...s.qtyRaw };
  for (const [id, q] of Object.entries(svc.preset.extras ?? {})) {
    const e = c.extras.find((x) => x.id === id && x.enabled);
    if (!e) continue;
    qtyRaw[id] = e.kind === 'area' ? (q > 0 ? '1' : '') : q > 0 ? String(q).replace('.', ',') : '';
  }
  const materialOk = svc.preset.materialId && activeMaterials(c).some((m) => m.id === svc.preset.materialId);
  return { ...s, serviceId: svc.id, materialId: materialOk ? svc.preset.materialId! : s.materialId, qtyRaw };
}

interface Props {
  config: PublicConfig;
  state: CalcState;
  setState: React.Dispatch<React.SetStateAction<CalcState>>;
  step: number;
  setStep: (n: number) => void;
}

/** Проверка всех полей + расчёт. Возвращает результат только когда всё корректно. */
export function useEstimate(config: PublicConfig, state: CalcState) {
  return useMemo(() => {
    const area = validateArea(state.areaRaw, config.pricing.maxArea);
    const qtyErrors: Record<string, string> = {};
    const quantities: Record<string, number> = {};
    for (const e of activeExtras(config)) {
      const raw = state.qtyRaw[e.id] ?? '';
      if (e.kind === 'area') {
        quantities[e.id] = raw === '1' ? 1 : 0;
        continue;
      }
      const v = validateQuantity(raw, e.kind);
      if (v.error) qtyErrors[e.id] = v.error;
      else quantities[e.id] = v.value ?? 0;
    }
    let result: CalcResult | null = null;
    const materialOk = activeMaterials(config).some((m) => m.id === state.materialId);
    if (area.value !== null && materialOk && Object.keys(qtyErrors).length === 0) {
      result = calculate(config, { roomTypeId: state.roomTypeId, area: area.value, materialId: state.materialId, quantities });
    }
    return { areaError: area.error, qtyErrors, result, materialOk, area: area.value, quantities };
  }, [config, state]);
}

export default function Calculator({ config, state, setState, step, setStep }: Props) {
  const { areaError, qtyErrors, result, materialOk, area, quantities } = useEstimate(config, state);
  const [touchedArea, setTouchedArea] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  const room = config.roomTypes.find((r) => r.id === state.roomTypeId) ?? config.roomTypes[0];
  const service = config.services.find((s) => s.id === state.serviceId);
  const materials = activeMaterials(config);
  const extras = activeExtras(config);
  const pieceExtras = extras.filter((e) => e.kind === 'piece');
  const otherExtras = extras.filter((e) => e.kind !== 'piece');

  const setQty = (id: string, v: string) => setState((s) => ({ ...s, qtyRaw: { ...s.qtyRaw, [id]: v } }));

  const stepError = (n: number): string | null => {
    if (n === 1) {
      if (areaError) return areaError;
      if (!materialOk) return 'Выберите тип полотна';
    }
    if (n === 2 && pieceExtras.some((e) => qtyErrors[e.id])) return 'Исправьте количество';
    if (n === 3 && otherExtras.some((e) => qtyErrors[e.id])) return 'Исправьте значения';
    return null;
  };

  const go = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => {
      const top = panelRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight * 0.4) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const next = () => {
    if (step === 1) setTouchedArea(true);
    if (stepError(step)) return;
    // если какие-то поля всё ещё некорректны — ведём на первый шаг с ошибкой
    if (step === 3) {
      for (let s = 1; s <= 3; s++) if (stepError(s)) return go(s);
    }
    go(step + 1);
  };

  const openContact = () => {
    setShowContact(true);
    requestAnimationFrame(() => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const err = stepError(step);

  return (
    <div className="calc" ref={panelRef}>
      <ol className="calc-steps" aria-label="Шаги расчёта">
        {STEPS.map((label, i) => {
          // назад — всегда, вперёд — только кнопкой «Дальше» (с проверкой полей)
          const reachable = i <= step;
          return (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <button type="button" onClick={() => go(i)} disabled={!reachable} aria-current={i === step ? 'step' : undefined}>
                <span className="calc-steps__n">{i + 1}</span>
                <span className="calc-steps__label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="calc-steps__current" aria-hidden>
        Шаг {step + 1} из {STEPS.length}: {STEPS[step]}
      </p>
      {service && (
        <p className="calc-service">
          <span>
            Услуга: <strong>{service.title}</strong>
          </span>
          <button type="button" onClick={() => setState((s) => ({ ...s, serviceId: '' }))} aria-label="Убрать выбранную услугу">
            ×
          </button>
        </p>
      )}

      <div className="calc-body">
        {step === 0 && (
          <fieldset className="calc-fieldset">
            <legend>Какое помещение?</legend>
            <div className="choice-grid">
              {config.roomTypes.map((r) => (
                <label key={r.id} className={`choice ${state.roomTypeId === r.id ? 'is-on' : ''}`}>
                  <input type="radio" name="room" value={r.id} checked={state.roomTypeId === r.id} onChange={() => setState((s) => ({ ...s, roomTypeId: r.id }))} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
            {room?.hint && <p className="calc-hint">{room.hint}</p>}
          </fieldset>
        )}

        {step === 1 && (
          <>
            <div className="field field--area">
              <label htmlFor="area">Площадь потолка</label>
              <div className="input-unit">
                <input
                  id="area"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="например, 18,5"
                  value={state.areaRaw}
                  onChange={(e) => setState((s) => ({ ...s, areaRaw: e.target.value }))}
                  onBlur={() => setTouchedArea(true)}
                  aria-invalid={touchedArea && !!areaError}
                  aria-describedby="area-help"
                />
                <span>м²</span>
              </div>
              <p id="area-help" className={touchedArea && areaError ? 'field-error' : 'field-help'}>
                {touchedArea && areaError ? areaError : 'Длина × ширина комнаты. Не знаете точно — укажите примерно, замерщик уточнит.'}
              </p>
            </div>

            <fieldset className="calc-fieldset">
              <legend>Тип полотна</legend>
              <div className="material-pick">
                {materials.map((m) => (
                  <label key={m.id} className={`material-opt ${state.materialId === m.id ? 'is-on' : ''}`}>
                    <input type="radio" name="material" value={m.id} checked={state.materialId === m.id} onChange={() => setState((s) => ({ ...s, materialId: m.id }))} />
                    <span className={`swatch ${m.glossy ? 'swatch--gloss' : ''}`} style={{ background: m.swatch }} aria-hidden />
                    <span className="material-opt__name">{m.name}</span>
                    <span className="material-opt__price">{num(m.pricePerM2)} ₽/м²</span>
                  </label>
                ))}
              </div>
              <p className="calc-hint">{pricingModelLabel(config)}.</p>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <div className="qty-list">
            {pieceExtras.map((e) => (
              <QtyRow key={e.id} extra={e} raw={state.qtyRaw[e.id] ?? ''} error={qtyErrors[e.id]} onChange={(v) => setQty(e.id, v)} suggested={room?.suggestedExtras.includes(e.id)} />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="qty-list">
            {otherExtras.map((e) =>
              e.kind === 'area' ? (
                <label key={e.id} className="toggle-row">
                  <input type="checkbox" checked={state.qtyRaw[e.id] === '1'} onChange={(ev) => setQty(e.id, ev.target.checked ? '1' : '')} />
                  <span className="toggle-row__text">
                    <strong>{e.label}</strong>
                    <small>{e.description}</small>
                  </span>
                  <span className="qty-price">{e.price === null ? 'по замеру' : `${num(e.price)} ₽/м²`}</span>
                </label>
              ) : (
                <QtyRow key={e.id} extra={e} raw={state.qtyRaw[e.id] ?? ''} error={qtyErrors[e.id]} onChange={(v) => setQty(e.id, v)} suggested={room?.suggestedExtras.includes(e.id)} />
              ),
            )}
          </div>
        )}

        {step === 4 && result && (
          <ResultView config={config} result={result} roomLabel={room?.label ?? ''} onEdit={() => go(1)} onRequest={openContact} />
        )}
        {step === 4 && !result && <p className="field-error">Проверьте параметры: площадь и количество должны быть заполнены корректно.</p>}
      </div>

      {step < 4 && (
        <div className="calc-nav">
          {step > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)}>
              Назад
            </button>
          ) : (
            <span />
          )}
          {result && (
            <span className="calc-nav__price" aria-hidden>
              <small>Предварительно</small>
              {rubRange(result.rangeLow, result.rangeHigh)}
            </span>
          )}
          <div className="calc-nav__right">
            {step === 1 && touchedArea && err && <span className="field-error calc-nav__err">{err}</span>}
            <button type="button" className="btn btn--primary" onClick={next}>
              {step === 3 ? 'Рассчитать стоимость потолка' : 'Дальше'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && showContact && area !== null && (
        <div ref={contactRef}>
          <ContactForm
            config={config}
            result={result}
            calc={{ serviceId: state.serviceId, roomTypeId: state.roomTypeId, area, materialId: state.materialId, quantities }}
          />
        </div>
      )}
    </div>
  );
}

function QtyRow({ extra, raw, error, onChange, suggested }: { extra: Extra; raw: string; error?: string; onChange: (v: string) => void; suggested?: boolean }) {
  const kind = extra.kind as 'piece' | 'meter';
  const stepBy = kind === 'piece' ? 1 : 0.5;
  const current = Number(raw.replace(',', '.')) || 0;
  const bump = (d: number) => {
    const n = Math.max(0, Math.round((current + d) * 100) / 100);
    if (kind === 'piece' && n > MAX_PIECES) return;
    onChange(n === 0 ? '' : String(n).replace('.', ','));
  };
  const id = `qty-${extra.id}`;
  return (
    <div className={`qty-row ${error ? 'has-error' : ''}`}>
      <div className="qty-row__text">
        <label htmlFor={id}>
          {extra.label}
          {suggested && <span className="tag">часто нужно</span>}
        </label>
        <small>{extra.description}</small>
      </div>
      <span className="qty-price">{extra.price === null ? 'по замеру' : `${num(extra.price)} ₽/${unitLabel(kind)}`}</span>
      <div className="stepper">
        <button type="button" onClick={() => bump(-stepBy)} aria-label={`Меньше: ${extra.label}`} disabled={current <= 0}>
          −
        </button>
        <input id={id} inputMode={kind === 'piece' ? 'numeric' : 'decimal'} placeholder="0" value={raw} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
        <button type="button" onClick={() => bump(stepBy)} aria-label={`Больше: ${extra.label}`}>
          +
        </button>
        <span className="stepper__unit">{unitLabel(kind)}</span>
      </div>
      {error && <p className="field-error qty-row__err">{error}</p>}
    </div>
  );
}

function ResultView({ config, result: r, roomLabel, onEdit, onRequest }: { config: PublicConfig; result: CalcResult; roomLabel: string; onEdit: () => void; onRequest: () => void }) {
  return (
    <div className="result">
      <p className="result__label">Предварительная стоимость</p>
      <p className="result__price" aria-live="polite">
        {rubRange(r.rangeLow, r.rangeHigh)}
      </p>
      <p className="result__note">{config.texts.estimateNote}</p>

      <table className="breakdown">
        <tbody>
          <tr>
            <th>Помещение</th>
            <td>{roomLabel}</td>
          </tr>
          <tr>
            <th>Площадь</th>
            <td>{num(r.area)} м²</td>
          </tr>
          <tr>
            <th>Полотно</th>
            <td>
              {r.material.name}, {num(r.canvasRate)} ₽/м²
            </td>
          </tr>
          {r.installationCost > 0 ? (
            <>
              <tr>
                <th>Полотно: {num(r.area)} м² × {num(r.canvasRate)} ₽</th>
                <td>{rub(r.canvasCost)}</td>
              </tr>
              <tr>
                <th>Монтаж: {num(r.area)} м² × {num(config.pricing.installationPerM2)} ₽</th>
                <td>{rub(r.installationCost)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <th>
                Полотно и монтаж
                <small>монтаж входит в цену за м²</small>
              </th>
              <td>{rub(r.canvasAndInstall)}</td>
            </tr>
          )}
          {r.extraLines.map((l) => (
            <tr key={l.extra.id}>
              <th>
                {l.extra.label}
                <small>
                  {num(l.qty)} {unitLabel(l.extra.kind)}
                  {l.extra.price !== null && ` × ${num(l.extra.price)} ₽`}
                </small>
              </th>
              <td>{l.cost === null ? <span className="muted">по замеру</span> : rub(l.cost)}</td>
            </tr>
          ))}
          <tr className="breakdown__sub">
            <th>Дополнительные работы</th>
            <td>{rub(r.extrasCost)}</td>
          </tr>
          {r.coefficientLines.map((k) => (
            <tr key={k.label}>
              <th>
                {k.label} <small>×{num(k.factor)}</small>
              </th>
              <td>{rub(k.delta)}</td>
            </tr>
          ))}
          <tr className="breakdown__sub">
            <th>Итого по расчёту</th>
            <td>{rub(r.subtotal)}</td>
          </tr>
          {r.minOrderApplied && (
            <tr className="breakdown__min">
              <th>
                Минимальная стоимость заказа
                <small>применяется, если расчёт меньше</small>
              </th>
              <td>{rub(r.minOrder)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {r.hasOnRequest && <p className="calc-hint">Опции с пометкой «по замеру» не входят в сумму — их стоимость назовёт замерщик.</p>}

      <div className="result__actions">
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          Изменить параметры
        </button>
        <button type="button" className="btn btn--primary" onClick={onRequest}>
          Оставить заявку на замер
        </button>
      </div>
    </div>
  );
}
