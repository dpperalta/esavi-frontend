import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import '@/shared/config/i18n';
import { Toaster } from '@/shared/components/ui/sonner';
import { useSyncTheme } from '@/shared/hooks/useSyncTheme';

const queryClient = new QueryClient();

interface AppProvidersProps {
  children: ReactNode;
}

// Wraps the whole app: TanStack Query, i18next (imported above for its init side effect),
// the live data-theme sync, and the toaster. app/router.tsx mounts inside this.
export function AppProviders({ children }: AppProvidersProps) {
  useSyncTheme();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
