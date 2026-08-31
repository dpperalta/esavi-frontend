import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/config/i18n';
import { useSyncTheme } from '@/shared/hooks/useSyncTheme';
import './index.css';

// Placeholder mount. app/providers.tsx and app/router.tsx replace this in later
// steps of SPEC FE01.
function Root() {
  useSyncTheme();
  return <div>ESAVI</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
