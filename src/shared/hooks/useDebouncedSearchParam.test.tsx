import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DebouncedSearchParamOptions, useDebouncedSearchParam } from './useDebouncedSearchParam';

function Harness({ options }: { options?: DebouncedSearchParamOptions }) {
  const [buffer, setBuffer] = useDebouncedSearchParam('q', options);
  const [, setSearchParams] = useSearchParams();
  return (
    <>
      <input aria-label="q" value={buffer} onChange={(event) => setBuffer(event.target.value)} />
      <button
        type="button"
        onClick={() =>
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete('includeInactive');
            return next;
          })
        }
      >
        toggle off
      </button>
      <button type="button" onClick={() => setSearchParams({})}>
        clear filters
      </button>
    </>
  );
}

function renderHarness(initialPath: string, options?: DebouncedSearchParamOptions) {
  const router = createMemoryRouter([{ path: '/', element: <Harness options={options} /> }], {
    initialEntries: [initialPath],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function typeAndWait(value: string, ms = 400) {
  fireEvent.change(screen.getByLabelText('q'), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const minThree = (value: string) => (value.trim().length >= 3 ? value.trim() : '');

describe('useDebouncedSearchParam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no deshace otro filtro cambiado dentro de la ventana del debounce', () => {
    const router = renderHarness('/?includeInactive=true');

    fireEvent.click(screen.getByRole('button', { name: 'toggle off' }));
    expect(router.state.location.search).toBe('');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(router.state.location.search).toBe('');
  });

  it('sin cambio en el texto no navega', () => {
    const router = renderHarness('/?q=fie');
    const { key } = router.state.location;

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(router.state.location.key).toBe(key);
  });

  it('escribe el texto tras la pausa, conserva los demás parámetros y borra page', () => {
    const router = renderHarness('/?includeInactive=true&page=3');

    typeAndWait('fiebre', 399);
    expect(router.state.location.search).toBe('?includeInactive=true&page=3');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(router.state.location.search).toBe('?includeInactive=true&q=fiebre');
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('un valor que normalize deja vacío quita el parámetro y conserva lo tecleado', () => {
    const router = renderHarness('/?q=paracetamol', { normalize: minThree });

    typeAndWait('pa');

    expect(router.state.location.search).toBe('');
    expect(screen.getByLabelText('q')).toHaveValue('pa');
  });

  it('con replace y resetPage: false, reemplaza la entrada y conserva page', () => {
    const router = renderHarness('/?page=2', { replace: true, resetPage: false });

    typeAndWait('ab');

    expect(router.state.location.search).toBe('?page=2&q=ab');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('cuando la URL cambia desde fuera, el campo la sigue', () => {
    renderHarness('/?q=fiebre');

    fireEvent.click(screen.getByRole('button', { name: 'clear filters' }));

    expect(screen.getByLabelText('q')).toHaveValue('');
  });
});
