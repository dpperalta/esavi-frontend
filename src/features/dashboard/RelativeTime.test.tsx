import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { RelativeTime } from './RelativeTime';

const NOW = new Date('2026-11-04T14:00:00.000Z');
const THREE_HOURS_AGO = '2026-11-04T11:00:00.000Z';

function renderAt(language: Language, iso = THREE_HOURS_AGO) {
  usePreferencesStore.getState().setLanguage(language);
  return render(
    <TooltipProvider>
      <RelativeTime iso={iso} />
    </TooltipProvider>,
  );
}

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    usePreferencesStore.getState().setLanguage('es');
  });

  it.each([
    ['es', 'hace 3 horas'],
    ['en', '3 hours ago'],
    ['nl', '3 uur geleden'],
  ] as const)('en %s, un ISO de hace 3 horas se lee «%s»', (language, expected) => {
    renderAt(language);

    const time = screen.getByText(expected);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', THREE_HOURS_AGO);
  });

  it('muestra la fecha exacta en el tooltip al recibir el foco', async () => {
    renderAt('en');

    fireEvent.focus(screen.getByText('3 hours ago'));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/2026/);
  });

  it('abre el tooltip con un toque', async () => {
    renderAt('es');

    fireEvent.click(screen.getByText('hace 3 horas'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(/2026/);
  });
});
