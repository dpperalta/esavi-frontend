import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCloseWhenReadOnly } from './useCloseWhenReadOnly';

describe('useCloseWhenReadOnly', () => {
  it('cierra cuando readOnly pasa de false a true', () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ readOnly }) => useCloseWhenReadOnly(readOnly, close), {
      initialProps: { readOnly: false },
    });

    expect(close).not.toHaveBeenCalled();
    rerender({ readOnly: true });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('no cierra al montar ya en sólo lectura ni mientras sigue en sólo lectura', () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ readOnly }) => useCloseWhenReadOnly(readOnly, close), {
      initialProps: { readOnly: true },
    });

    rerender({ readOnly: true });

    expect(close).not.toHaveBeenCalled();
  });

  it('no cierra al volver a false, y vuelve a cerrar en la siguiente transición a true', () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ readOnly }) => useCloseWhenReadOnly(readOnly, close), {
      initialProps: { readOnly: false },
    });

    rerender({ readOnly: true });
    rerender({ readOnly: false });
    expect(close).toHaveBeenCalledTimes(1);

    rerender({ readOnly: true });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('llama a la versión más reciente de close', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ readOnly, close }) => useCloseWhenReadOnly(readOnly, close),
      { initialProps: { readOnly: false, close: first } },
    );

    rerender({ readOnly: true, close: second });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
