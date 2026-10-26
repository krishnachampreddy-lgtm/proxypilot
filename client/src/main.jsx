import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './pwa.js';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';

// ?still=morning|evening renders one high-quality photo of the campus (used to make the app backgrounds)
const stillTime = new URLSearchParams(window.location.search).get('still');
if (stillTime) {
  const el = document.getElementById('root');
  el.style.cssText = 'position:fixed;inset:0';
  const stop = new URLSearchParams(window.location.search).get('stop');
  window.__campusDebug = true;
  import('./campus/index.js').then(({ createCampus, STOPS }) => {
    const view = stop !== null ? STOPS[+stop] : undefined;
    const api = createCampus(el, { mode: 'still', time: stillTime, view });
    api.ready.then(() => {
      api.renderStill();
      window.__stillReady = true;
    });
  });
} else createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
