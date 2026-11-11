import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startPrinting } from './lib/bluetooth/startup';
import { reloadForNewVersion } from './lib/reloadForNewVersion';

// After an update the old screen files are gone; load the new version instead of showing an error.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

startPrinting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
