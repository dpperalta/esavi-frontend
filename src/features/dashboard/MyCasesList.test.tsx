import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardMyCase } from '@/contracts/dashboard';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { MyCasesList } from './MyCasesList';
import { recentActivityFixture } from './recentActivityFixture';

function renderList(items: DashboardMyCase[], windowDays = 30) {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <MyCasesList items={items} windowDays={windowDays} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe('MyCasesList', () => {
  it('muestra código, estado, última acción y fecha relativa', () => {
    renderList(recentActivityFixture().myCases);

    const [row] = within(screen.getByRole('list', { name: 'Mis casos' })).getAllByRole('listitem');
    expect(row).toHaveTextContent('ESAVI-0001');
    expect(row).toHaveTextContent('En investigación');
    expect(row).toHaveTextContent('Etapa completada');
    expect(row!.querySelector('time')).toHaveAttribute('dateTime', '2026-11-04T11:00:00.000Z');
  });

  it('enlaza al wizard con aria-label «Retomar {{code}}»', () => {
    renderList(recentActivityFixture().myCases);

    const link = screen.getByRole('link', { name: 'Retomar ESAVI-0001' });
    expect(link.getAttribute('href')).toMatch(/\/wizard$/);
    expect(link).toHaveAttribute('href', '/esavi-cases/case-1/wizard');
  });

  it('un estado desconocido se muestra con su código', () => {
    const [item] = recentActivityFixture().myCases;
    renderList([{ ...item!, statusCode: 'ARCHIVED' }]);

    expect(screen.getByRole('listitem')).toHaveTextContent('ARCHIVED');
  });

  it('respeta el orden recibido', () => {
    const [item] = recentActivityFixture().myCases;
    renderList([
      { ...item!, caseId: 'b', caseCode: 'ESAVI-0009' },
      { ...item!, caseId: 'a', caseCode: 'ESAVI-0003' },
    ]);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'ESAVI-0009',
      'ESAVI-0003',
    ]);
  });

  it('vacío, dice el texto con windowDays', () => {
    renderList([], 30);

    expect(
      screen.getByText('No has intervenido en ningún caso en los últimos 30 días.'),
    ).toBeInTheDocument();
  });
});
