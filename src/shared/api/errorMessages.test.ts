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

  // SPEC FE14b §3.5, plan step 1 — close (008) and reopen (009).
  it.each([
    ['CASEFLOW_008_NOT_FOUND', 'El caso no tiene expediente de flujo.'],
    ['CASEFLOW_008_ALREADY_CLOSED', 'Este expediente ya estaba cerrado.'],
    [
      'CASEFLOW_008_PENDING_VALIDATION',
      'No se puede cerrar: el expediente está pendiente de validación.',
    ],
    ['CASEFLOW_008_CLASSIFICATION_REQUIRED', 'No se puede cerrar: falta la clasificación inicial.'],
    ['CASEFLOW_008_NOTIFICATION_REQUIRED', 'No se puede cerrar: falta la notificación.'],
    ['CASEFLOW_008_INVESTIGATION_REQUIRED', 'No se puede cerrar: falta la investigación.'],
    [
      'CASEFLOW_008_FINAL_CLASSIFICATION_REQUIRED',
      'No se puede cerrar: falta la clasificación final.',
    ],
    ['CASEFLOW_008_CLOSE_FAILED', 'No pudimos cerrar el expediente. Intenta de nuevo.'],
    ['CASEFLOW_009_NOT_FOUND', 'El caso no tiene expediente de flujo.'],
    ['CASEFLOW_009_NOT_CLOSED', 'Este expediente ya no está cerrado.'],
    ['CASEFLOW_009_REOPEN_FAILED', 'No pudimos reabrir el expediente. Intenta de nuevo.'],
  ])('mapea %s a su texto propio', (code, expected) => {
    const error = new EsaviApiError('mensaje del backend', 409, code);

    expect(getErrorMessage(error)).toBe(expected);
  });

  // SPEC FE23 §3.5, plan step 1 — request (010) and resolve (011) validation.
  it.each([
    ['CASEFLOW_010_NOT_FOUND', 'El caso no tiene expediente de flujo.'],
    ['CASEFLOW_010_ALREADY_PENDING', 'Este expediente ya estaba pendiente de validación.'],
    ['CASEFLOW_010_CASE_CLOSED', 'No se puede pedir la validación: el expediente está cerrado.'],
    [
      'CASEFLOW_010_STATUS_NOT_FOUND',
      'Falta el estado «Pendiente de validación» en el catálogo. Avisa al administrador.',
    ],
    [
      'CASEFLOW_010_REQUEST_FAILED',
      'No pudimos enviar el expediente a validación. Intenta de nuevo.',
    ],
    ['CASEFLOW_011_NOT_FOUND', 'El caso no tiene expediente de flujo.'],
    ['CASEFLOW_011_NOT_PENDING', 'Este expediente ya no está pendiente de validación.'],
    [
      'CASEFLOW_011_PREVIOUS_STATUS_MISSING',
      'No se sabe a qué estado debe volver el expediente. Avisa al administrador.',
    ],
    [
      'CASEFLOW_011_STATUS_NOT_FOUND',
      'Falta el estado anterior en el catálogo. Avisa al administrador.',
    ],
    ['CASEFLOW_011_RESOLVE_FAILED', 'No pudimos resolver la validación. Intenta de nuevo.'],
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
    [
      'SEVNOT_001_CREATION_FAILED',
      'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.',
    ],
    [
      'SEVNOT_004_UPDATE_FAILED',
      'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.',
    ],
    [
      'SEVNOT_004_NOT_FOUND',
      'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.',
    ],
    [
      'SEVNOT_001_NOTIFICATION_NOT_FOUND',
      'No pudimos guardar la ficha de notificación grave. Intenta de nuevo.',
    ],
    [
      'NSEVNOT_001_CREATION_FAILED',
      'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.',
    ],
    [
      'NSEVNOT_004_UPDATE_FAILED',
      'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.',
    ],
    [
      'NSEVNOT_004_NOT_FOUND',
      'No pudimos guardar la ficha de notificación no grave. Intenta de nuevo.',
    ],
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

  // SPEC FE21 §3.5 — los cuatro códigos de appRole que llegan al toast. Los de duplicado y
  // escalada no están aquí a propósito: `appRoleErrorFieldMap` los lleva a su campo.
  it.each([
    ['APPROLE_004_SYSTEM_ROLE', 'Es un rol de sistema: modificarlo exige un superadministrador.'],
    ['APPROLE_005A_SYSTEM_ROLE', 'Es un rol de sistema: modificarlo exige un superadministrador.'],
    ['APPROLE_005A_SUPERADMIN_ROLE', 'El rol SUPERADMIN no se puede retirar.'],
    [
      'APPROLE_005A_HAS_ACTIVE_ASSIGNMENTS',
      'No se puede retirar un rol que todavía portan usuarios.',
    ],
  ])('mapea %s al texto de appRole', (code, expected) => {
    const error = new EsaviApiError('mensaje del backend', 409, code);

    expect(getErrorMessage(error)).toBe(expected);
  });

  // SPEC FE21 §3.5 — el duplicado se pinta bajo su campo con el `message` del backend, que ya
  // viene traducido (CONVENTIONS.md §6.2). Si algún día llegara a un toast, el texto sería ese
  // mismo y no una clave del cliente.
  it('no mapea los códigos de duplicado de appRole: son de campo, no de toast', () => {
    const error = new EsaviApiError(
      'Ya existe un rol con el código SUPERVISOR.',
      409,
      'APPROLE_001_CODE_EXISTS',
    );

    expect(getErrorMessage(error)).toBe('Ya existe un rol con el código SUPERVISOR.');
  });
});
