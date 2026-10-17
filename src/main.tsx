import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Шрифты хранятся на своём сервере (без Google Fonts): быстрее в РФ и без передачи данных третьим лицам.
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/unbounded/700.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
