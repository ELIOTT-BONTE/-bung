import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { loadEnvKeys } from './inference';

// Only the real entry point reads build-time keys. Tests render `<App />`
// directly and so never pick up a developer's `.env`, which keeps the suite
// from making live API calls.
loadEnvKeys();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
