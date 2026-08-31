import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/config/i18n';
import './index.css';

// Placeholder mount. app/providers.tsx and app/router.tsx replace this in later
// steps of SPEC FE01.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>ESAVI</div>
  </StrictMode>,
);
