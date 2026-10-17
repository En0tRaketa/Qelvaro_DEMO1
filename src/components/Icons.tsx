import type { WhyItem } from '../config/types';

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function WhyIcon({ name }: { name: WhyItem['icon'] }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      {name === 'ruler' && (
        <g {...s}>
          <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
          <path d="M6 8v3M9.5 8v4M13 8v3M16.5 8v4" />
        </g>
      )}
      {name === 'clean' && (
        <g {...s}>
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
          <path d="M18.5 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
        </g>
      )}
      {name === 'receipt' && (
        <g {...s}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </g>
      )}
      {name === 'clock' && (
        <g {...s}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </g>
      )}
      {name === 'shield' && (
        <g {...s}>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </g>
      )}
      {name === 'light' && (
        <g {...s}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
        </g>
      )}
    </svg>
  );
}

export type SocialKey = 'vk' | 'telegram' | 'instagram' | 'whatsapp';
export const SOCIAL_LABEL: Record<SocialKey, string> = { vk: 'ВКонтакте', telegram: 'Telegram', instagram: 'Instagram', whatsapp: 'WhatsApp' };

export function SocialIcon({ name, size = 20 }: { name: SocialKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'telegram' && (
        <path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1.1-1 .2-1.5L20.5 2.7c.9-.3 1.7.2 1.4 1.6z" />
      )}
      {name === 'vk' && (
        <path
          fill="currentColor"
          d="M12.8 17.5C6.6 17.5 3 13.3 2.9 6.3h3.1c.1 5.1 2.4 7.3 4.2 7.7V6.3h2.9v4.4c1.8-.2 3.7-2.2 4.3-4.4h2.9c-.5 2.7-2.5 4.7-3.9 5.5 1.4.7 3.7 2.4 4.6 5.7h-3.2c-.7-2.2-2.4-3.9-4.7-4.1v4.1z"
        />
      )}
      {name === 'instagram' && (
        <g fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
        </g>
      )}
      {name === 'whatsapp' && (
        <g>
          <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 20l1.2-4A8.5 8.5 0 1 1 8.4 19z" />
          <path fill="currentColor" d="M9.3 7.8c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.6 1 1.4 1.8 2.5 2.3.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .5-.1 1.2-.7 1.6-.5.4-1.3.6-2.2.3-3-.9-5.2-3.3-5.9-5.6-.3-.9 0-1.7.3-2.3z" />
        </g>
      )}
    </svg>
  );
}

/** Активные соцсети в фиксированном порядке. */
export function activeSocials(social: Record<SocialKey, string>) {
  return (['vk', 'telegram', 'instagram', 'whatsapp'] as SocialKey[]).filter((k) => social[k]?.trim()).map((k) => ({ key: k, url: social[k], label: SOCIAL_LABEL[k] }));
}
