/**
 * Доставка заявок.
 *  Telegram: бот → канал / группа / личный чат владельца (метод sendMessage).
 *  ВКонтакте: сообщество → администраторам в личные сообщения или в беседу (метод messages.send).
 * Адреса API можно переопределить (TELEGRAM_API_BASE, VK_API_BASE) — например, для прокси.
 */
import type { Integrations } from '../src/config/types.ts';
import type { DeliveryStatus } from './store.ts';

const TG_API = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '');
const VK_API = (process.env.VK_API_BASE ?? 'https://api.vk.com').replace(/\/$/, '');
const VK_VERSION = '5.199';
const TIMEOUT = 8000;

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function explainTg(desc: string): string {
  if (/chat not found/i.test(desc)) return 'Чат не найден: проверьте chat id и добавьте бота в канал администратором';
  if (/bot is not a member|not enough rights|need administrator/i.test(desc)) return 'Бот не может писать в этот чат: добавьте его администратором с правом публикации';
  if (/unauthorized/i.test(desc)) return 'Неверный токен бота';
  if (/bot was blocked|can't initiate/i.test(desc)) return 'Бот не может писать первым: откройте бота и нажмите «Старт»';
  return desc;
}
function explainVk(code: number, msg: string): string {
  if (code === 5) return 'Неверный ключ доступа сообщества';
  if (code === 15 || code === 917) return 'Нет доступа: включите сообщения сообщества и проверьте права ключа';
  if (code === 901) return 'Получатель не разрешил сообщения от сообщества: пусть напишет сообществу первым';
  if (code === 27) return 'Нужен ключ доступа сообщества, а не пользователя';
  return `${msg} (код ${code})`;
}

export async function sendTelegram(token: string, chatIds: string, text: string): Promise<DeliveryStatus> {
  const targets = list(chatIds);
  if (!token || !targets.length) return { status: 'off' };
  const errors: string[] = [];
  let sent = 0;
  for (const chat_id of targets) {
    try {
      const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (body.ok) sent++;
      else errors.push(`${chat_id}: ${explainTg(body.description ?? `HTTP ${res.status}`)}`);
    } catch (e) {
      errors.push(`${chat_id}: нет связи с Telegram (${(e as Error).name === 'TimeoutError' ? 'таймаут' : (e as Error).message})`);
    }
  }
  return sent ? { status: 'sent', ...(errors.length ? { error: errors.join('; ') } : {}) } : { status: 'failed', error: errors.join('; ') };
}

export async function sendVk(token: string, peerIds: string, text: string): Promise<DeliveryStatus> {
  const targets = list(peerIds);
  if (!token || !targets.length) return { status: 'off' };
  const errors: string[] = [];
  let sent = 0;
  for (const peer_id of targets) {
    try {
      const form = new URLSearchParams({
        peer_id,
        message: text,
        random_id: String(Math.floor(Math.random() * 2 ** 31)),
        access_token: token,
        v: VK_VERSION,
      });
      const res = await fetch(`${VK_API}/method/messages.send`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT) });
      const body = (await res.json().catch(() => ({}))) as { response?: unknown; error?: { error_code: number; error_msg: string } };
      if (body.response !== undefined) sent++;
      else errors.push(`${peer_id}: ${body.error ? explainVk(body.error.error_code, body.error.error_msg) : `HTTP ${res.status}`}`);
    } catch (e) {
      errors.push(`${peer_id}: нет связи с ВКонтакте (${(e as Error).name === 'TimeoutError' ? 'таймаут' : (e as Error).message})`);
    }
  }
  return sent ? { status: 'sent', ...(errors.length ? { error: errors.join('; ') } : {}) } : { status: 'failed', error: errors.join('; ') };
}

/** Отправка во все включённые каналы параллельно. */
export async function deliver(i: Integrations, text: string, ignoreEnabled = false) {
  const [telegram, vk] = await Promise.all([
    i.telegram.enabled || ignoreEnabled ? sendTelegram(i.telegram.botToken, i.telegram.chatId, text) : Promise.resolve<DeliveryStatus>({ status: 'off' }),
    i.vk.enabled || ignoreEnabled ? sendVk(i.vk.groupToken, i.vk.peerIds, text) : Promise.resolve<DeliveryStatus>({ status: 'off' }),
  ]);
  return { telegram, vk };
}
