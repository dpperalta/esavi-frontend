import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardActivityAction, DashboardActivityEvent } from '@/contracts/dashboard';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { recentActivityFixture } from './recentActivityFixture';
import { TerritoryActivityFeed } from './TerritoryActivityFeed';

const LONG_AUTHOR = 'investigator.long.address@example.org';

function renderFeed(items: DashboardActivityEvent[], windowDays = 30) {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <TerritoryActivityFeed items={items} windowDays={windowDays} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function rows() {
  return within(screen.getByRole('list', { name: 'Actividad del territorio' })).getAllByRole(
    'listitem',
  );
}

describe('TerritoryActivityFeed', () => {
  it('muestra las filas en el orden recibido, con la acción localizada', () => {
    renderFeed(recentActivityFixture().territory);

    const [first, second] = rows();
    expect(first).toHaveTextContent('Etapa completada');
    expect(second).toHaveTextContent('Caso creado');
  });

  it('con author null no muestra autor ni marcador', () => {
    renderFeed(recentActivityFixture().territory);

    const second = rows()[1]!;
    expect(second).not.toHaveTextContent(/por /);
    expect(second).not.toHaveTextContent(/—|desconocido/i);
  });

  it('trunca un email de más de 24 caracteres y lo muestra completo en el tooltip', async () => {
    renderFeed(recentActivityFixture().territory);

    const visible = screen.getByText(`por ${LONG_AUTHOR.slice(0, 23)}…`);
    expect(visible).toBeInTheDocument();

    fireEvent.focus(visible.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_AUTHOR);
  });

  it('un email corto no se trunca', () => {
    const [event] = recentActivityFixture().territory;
    renderFeed([{ ...event!, author: 'ana@example.org' }]);

    expect(
      screen.getByText('por ana@example.org', { selector: '[aria-hidden]' }),
    ).toBeInTheDocument();
  });

  it('un action desconocido se lee como «Otra acción»', () => {
    const [event] = recentActivityFixture().territory;
    renderFeed([{ ...event!, action: 'SOMETHING_NEW' as DashboardActivityAction }]);

    expect(rows()[0]).toHaveTextContent('Otra acción');
  });

  it('enlaza al detalle del caso con aria-label «Ver {{code}}», no al wizard', () => {
    renderFeed(recentActivityFixture().territory);

    const link = screen.getByRole('link', { name: 'Ver ESAVI-0001' });
    expect(link).toHaveAttribute('href', '/esavi-cases/case-1');
    expect(link).toHaveTextContent('ESAVI-0001');
  });

  it('method no aparece en ningún texto visible ni aria-label', () => {
    const { container } = renderFeed(recentActivityFixture().territory);

    expect(container).not.toHaveTextContent('ESAVI-CASEFLOW-007');
    expect(container.querySelector('[aria-label*="CASEFLOW"]')).toBeNull();
  });

  it('con y sin autor (ADMIN y USER) las filas solo difieren en el autor', () => {
    const withAuthor = recentActivityFixture().territory;
    const { unmount } = renderFeed(withAuthor);
    const adminText = rows().map((row) => row.textContent?.replace(/por .*$/, ''));
    unmount();

    renderFeed(withAuthor.map((event) => ({ ...event, author: null })));
    expect(rows().map((row) => row.textContent)).toEqual(adminText);
  });

  it('vacío, dice el texto con windowDays', () => {
    renderFeed([], 30);

    expect(
      screen.getByText('No hay actividad en tu territorio en los últimos 30 días.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
