import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorMessages';
import { EsaviApiError } from './types';

describe('getErrorMessage', () => {
  it('devuelve el `message` del backend cuando el `code` no está mapeado', () => {
    const error = new EsaviApiError('Algo salió mal', 400, 'FOO_001_UNMAPPED');

    expect(getErrorMessage(error)).toBe('Algo salió mal');
  });

  it('devuelve la clave de reserva cuando el `code` no está mapeado y `message` está vacío', () => {
    const error = new EsaviApiError('', 400, 'FOO_001_UNMAPPED');

    expect(getErrorMessage(error)).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
  });
});
