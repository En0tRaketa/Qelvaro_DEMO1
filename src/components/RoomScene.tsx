import { useId } from 'react';
import type { IllustrationKind } from '../config/types';

interface Props {
  variant?: IllustrationKind;
  /** Цвет полотна (перекрывает цвет варианта). */
  ceiling?: string;
  spotlights?: number;
  dims?: [string, string] | null;
  className?: string;
}

const LOOK: Record<IllustrationKind, { ceiling: string; glossy: boolean; wall: [string, string]; floor: [string, string] }> = {
  matte: { ceiling: '#f6f4f0', glossy: false, wall: ['#ebe7e0', '#ddd8cf'], floor: ['#c9b79c', '#b39d7e'] },
  glossy: { ceiling: '#eef2f6', glossy: true, wall: ['#e6e9ec', '#d6dbe0'], floor: ['#a9a49c', '#8f8a82'] },
  satin: { ceiling: '#f7efe6', glossy: true, wall: ['#efe6dc', '#e0d4c6'], floor: ['#c6a989', '#a98c6c'] },
  fabric: { ceiling: '#ece5d9', glossy: false, wall: ['#e7e1d6', '#d8d0c2'], floor: ['#8c7b66', '#76664f'] },
  shadow: { ceiling: '#f5f5f3', glossy: false, wall: ['#e3e3df', '#d2d2cc'], floor: ['#b8b2a8', '#a39c91'] },
  lines: { ceiling: '#f3f3f1', glossy: false, wall: ['#2f3439', '#262a2e'], floor: ['#5c5853', '#4a4743'] },
  demolition: { ceiling: '#e9e6e0', glossy: false, wall: ['#e2ddd4', '#d3cdc2'], floor: ['#bcaa90', '#a8957a'] },
  room: { ceiling: '#f6f4f0', glossy: true, wall: ['#e9e6e0', '#dcd8d0'], floor: ['#c9b79c', '#b39d7e'] },
};

/**
 * Иллюстрация помещения с натяжным потолком (SVG). Показывается, пока владелец
 * не добавил фото (или если файл картинки не найден).
 */
export default function RoomScene({ variant = 'room', ceiling, spotlights = 6, dims = null, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const look = LOOK[variant];
  const ceil = ceiling ?? look.ceiling;
  const id = (n: string) => `${n}-${uid}`;
  const showSpots = variant !== 'lines' && variant !== 'demolition';
  const lights = Array.from({ length: showSpots ? spotlights : 0 }, (_, i) => {
    const cols = Math.ceil(spotlights / 2);
    const row = i < cols ? 0 : 1;
    const col = row === 0 ? i : i - cols;
    const y = row === 0 ? 36 : 84;
    const spread = row === 0 ? 420 : 300;
    const x = cols === 1 ? 300 : 300 - spread / 2 + (spread / (cols - 1)) * col;
    return { x, y, rx: row === 0 ? 9 : 7, ry: row === 0 ? 3.2 : 2.6 };
  });

  return (
    <svg className={className} viewBox="0 0 600 440" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Иллюстрация помещения с натяжным потолком">
      <defs>
        <linearGradient id={id('ceil')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ceil} />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id={id('gloss')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".9" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('glow')}>
          <stop offset="0" stopColor="#fff6dc" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('wall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.wall[0]} />
          <stop offset="1" stopColor={look.wall[1]} />
        </linearGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.floor[0]} />
          <stop offset="1" stopColor={look.floor[1]} />
        </linearGradient>
        <linearGradient id={id('window')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe3f2" />
          <stop offset="1" stopColor="#eef5fa" />
        </linearGradient>
        <pattern id={id('weave')} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 3h6M3 0v6" stroke="#cfc4b2" strokeWidth=".6" opacity=".6" />
        </pattern>
      </defs>

      <polygon points="0,0 130,120 130,320 0,440" fill={look.wall[1]} />
      <polygon points="600,0 470,120 470,320 600,440" fill={look.wall[1]} opacity=".92" />
      <rect x="130" y="120" width="340" height="200" fill={`url(#${id('wall')})`} />
      <polygon points="130,320 470,320 600,440 0,440" fill={`url(#${id('floor')})`} />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <line key={t} x1={130 + 340 * t} y1="320" x2={600 * t} y2="440" stroke="#000" strokeOpacity=".08" />
      ))}

      <rect x="300" y="150" width="120" height="120" rx="2" fill={`url(#${id('window')})`} stroke="#fff" strokeWidth="6" />
      <line x1="360" y1="150" x2="360" y2="270" stroke="#fff" strokeWidth="4" />
      <rect x="282" y="128" width="20" height="160" fill="#c8c2b6" />
      <rect x="420" y="128" width="22" height="160" fill="#c8c2b6" />

      {variant === 'demolition' ? (
        <g>
          <rect x="190" y="160" width="10" height="160" fill="#8a8f94" transform="rotate(-8 195 240)" />
          <rect x="240" y="160" width="10" height="160" fill="#8a8f94" transform="rotate(8 245 240)" />
          {[190, 220, 250, 280].map((y) => (
            <rect key={y} x="196" y={y} width="48" height="7" fill="#9aa0a5" />
          ))}
        </g>
      ) : (
        <g>
          <rect x="160" y="250" width="110" height="46" rx="8" fill="#5d6770" />
          <rect x="160" y="232" width="110" height="30" rx="8" fill="#6c7780" />
          <rect x="168" y="296" width="6" height="12" fill="#3a4148" />
          <rect x="256" y="296" width="6" height="12" fill="#3a4148" />
        </g>
      )}

      {/* потолок */}
      <polygon points="0,0 600,0 470,120 130,120" fill={`url(#${id('ceil')})`} />
      {variant === 'fabric' && <polygon points="0,0 600,0 470,120 130,120" fill={`url(#${id('weave')})`} />}
      {look.glossy && <polygon points="0,0 600,0 470,120 130,120" fill={`url(#${id('gloss')})`} opacity={variant === 'satin' ? 0.35 : 0.75} />}
      {look.glossy && variant === 'glossy' && <polygon points="310,8 400,8 380,60 316,60" fill="#cfe3f2" opacity=".4" />}
      {variant === 'demolition' && (
        <path d="M150 0 C 210 40, 330 70, 420 30 L 450 0 Z" fill="#d9d3c8" stroke="#bdb5a7" strokeDasharray="6 5" />
      )}
      <polyline
        points="0,2 130,121 470,121 600,2"
        fill="none"
        stroke="#23282c"
        strokeOpacity={variant === 'shadow' ? 0.85 : 0.45}
        strokeWidth={variant === 'shadow' ? 5 : 2}
      />
      {variant === 'lines' &&
        [
          [60, 18, 540, 18],
          [100, 58, 500, 58],
          [300, 6, 300, 112],
        ].map(([x1, y1, x2, y2], i) => (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff3cf" strokeWidth="14" strokeOpacity=".35" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fffdf4" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}

      {lights.map((l, i) => (
        <g key={i}>
          <ellipse cx={l.x} cy={l.y + 8} rx="36" ry="22" fill={`url(#${id('glow')})`} />
          <ellipse cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} fill="#fffbe9" stroke="#b9b4aa" strokeWidth="1" />
        </g>
      ))}

      {dims && (
        <>
          <g stroke="#FF6A13" strokeWidth="2.5">
            <line x1="20" y1="428" x2="580" y2="428" />
            <line x1="20" y1="420" x2="20" y2="436" />
            <line x1="580" y1="420" x2="580" y2="436" />
            <line x1="488" y1="330" x2="584" y2="418" />
          </g>
          <g fontFamily="Golos Text, system-ui, sans-serif" fontWeight="700" fontSize="15">
            <rect x="262" y="416" width="76" height="24" rx="12" fill="#FF6A13" />
            <text x="300" y="433" textAnchor="middle" fill="#fff">
              {dims[0]}
            </text>
            <rect x="516" y="356" width="76" height="24" rx="12" fill="#FF6A13" />
            <text x="554" y="373" textAnchor="middle" fill="#fff">
              {dims[1]}
            </text>
          </g>
        </>
      )}
    </svg>
  );
}
