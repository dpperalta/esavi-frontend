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

  // SPEC FE08 §3.6, plan step 11 — the five caseWorkflow codes.
  it.each([
    ['CASEFLOW_006_CASE_NOT_FOUND', 'El caso no existe.'],
    ['CASEFLOW_006_NOT_FOUND', 'El caso no tiene expediente de flujo.'],
    ['CASEFLOW_007_STAGE_NOT_STARTED', 'Esta etapa aún no se ha iniciado.'],
    ['CASEFLOW_007_STAGE_ALREADY_COMPLETED', 'Esta etapa ya se completó.'],
    ['CASEFLOW_007_CASE_CLOSED', 'Este expediente está cerrado.'],
  ])('mapea %s a su texto propio', (code, expected) => {
    const error = new EsaviApiError('mensaje del backend', 409, code);

    expect(getErrorMessage(error)).toBe(expected);
  });

  // SPEC FE12a §3.5, plan step 15 — un texto genérico por entidad para los `_CREATION_FAILED`/
  // `_UPDATE_FAILED`/`_NOT_FOUND` de guardado, y uno solo compartido para los `006` de lectura.
  it.each([
    ['NOTIFCN_001_CREATION_FAILED', 'No pudimos guardar la notificación. Intenta de nuevo.'],
    ['NOTIFCN_004_UPDATE_FAILED', 'No pudimos guardar la notificación. Intenta de nuevo.'],
    ['NOTIFCN_004_NOT_FOUND', 'No pudimos guardar la notificación. Intenta de nuevo.'],
    ['NOTIFCN_001_CASE_NOT_FOUND', 'No pudimos guardar la notificación. Intenta de nuevo.'],
    ['SEVNOT_001_CREATION_FAILED', 'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.'],
    ['SEVNOT_004_UPDATE_FAILED', 'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.'],
    ['SEVNOT_004_NOT_FOUND', 'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.'],
    ['SEVNOT_001_NOTIFICATION_NOT_FOUND', 'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.'],
    ['NSEVNOT_001_CREATION_FAILED', 'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.'],
    ['NSEVNOT_004_UPDATE_FAILED', 'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.'],
    ['NSEVNOT_004_NOT_FOUND', 'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.'],
    [
      'NSEVNOT_001_NOTIFICATION_NOT_FOUND',
      'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.',
    ],
    ['NOTIFCN_006_NOT_FOUND', 'No pudimos cargar la notificación.'],
    ['NOTIFCN_006_CASE_NOT_FOUND', 'No pudimos cargar la notificación.'],
    ['SEVNOT_006_NOT_FOUND', 'No pudimos cargar la notificación.'],
    ['SEVNOT_006_CASE_NOT_FOUND', 'No pudimos cargar la notificación.'],
    ['NSEVNOT_006_NOT_FOUND', 'No pudimos cargar la notificación.'],
    ['NSEVNOT_006_CASE_NOT_FOUND', 'No pudimos cargar la notificación.'],
  ])('mapea %s a su texto propio', (code, expected) => {
    const error = new EsaviApiError('mensaje del backend', 500, code);

    expect(getErrorMessage(error)).toBe(expected);
  });
});
