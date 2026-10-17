import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { PublicConfig } from './config/types';
import { getConfig } from './api';
import Site from './pages/Site';

const Admin = lazy(() => import('./pages/Admin'));

/** Hash-маршруты: #/admin, #/privacy, остальное — лендинг. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getConfig()
      .then(setConfig)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (hash.startsWith('#/admin') || (window.location.pathname.endsWith('/admin.html') && !hash)) {
    return (
      <Suspense fallback={<div className="page-state">Загружаем админку…</div>}>
        <Admin />
      </Suspense>
    );
  }
  if (error) {
    return (
      <div className="page-state">
        <p>Не удалось загрузить сайт. {error}</p>
        <button className="btn btn--primary" onClick={load}>
          Попробовать снова
        </button>
      </div>
    );
  }
  if (!config) return <div className="page-state page-state--loading" aria-busy="true" />;
  if (hash.startsWith('#/privacy')) {
    return (
      <div className="privacy wrap">
        <a href="#/">← На главную</a>
        <h1>Политика обработки персональных данных</h1>
        {config.texts.privacyPolicy.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }
  return <Site config={config} />;
}
