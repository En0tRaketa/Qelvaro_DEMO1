/** Ручная отправка заявки клиентом — запасной путь, если автоматическая доставка не сработала. */

export function telegramUsername(url: string): string | null {
  const m = /^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z][\w]{4,31})\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

/** Чат компании с подставленным текстом (если в соцсетях указан https://t.me/username), иначе выбор чата. */
export function telegramLink(socialUrl: string, text: string, pageUrl: string): string {
  const u = telegramUsername(socialUrl);
  if (u) return `https://t.me/${u}?text=${encodeURIComponent(text)}`;
  return `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* запасной способ ниже */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
