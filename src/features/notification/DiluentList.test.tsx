import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import '@/shared/config/i18n';
import { describe, expect, it } from 'vitest';
import { DiluentList } from './DiluentList';

function renderList(vaccineId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiluentList vaccineId={vaccineId} vaccinationDate={null} />
    </QueryClientProvider>,
  );
}

describe('DiluentList — SPEC FE12c §4 paso 9', () => {
  it('sin vaccineId, la sección sale deshabilitada con su explicación y no pide nada al servidor', () => {
    renderList(null);

    expect(screen.getByText('notificationDiluent.list.needsParent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notificationDiluent\.list\.add/ })).not.toBeInTheDocument();
  });
});
