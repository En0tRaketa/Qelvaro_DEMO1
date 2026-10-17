import { useEffect, useState } from 'react';
import type { IllustrationKind } from '../config/types';
import RoomScene from './RoomScene';

/**
 * Картинка с запасным вариантом: если файла по пути ещё нет (владелец не добавил фото),
 * показывается иллюстрация. Так сайт выглядит законченным с первого запуска.
 */
export default function Img({ src, alt, fallback, className, eager }: { src: string; alt: string; fallback: IllustrationKind; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  if (failed) return <RoomScene variant={fallback} className={className} />;
  return <img src={src} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />;
}
