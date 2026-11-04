import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { CASE_WORKFLOW_STATUS_CODES } from '@/contracts/declared/caseWorkflow';
import { statusLabel } from './statusLabel';

describe('statusLabel', () => {
  it('devuelve la etiqueta localizada de un código conocido', () => {
    expect(statusLabel(i18next.t, 'IN_INVESTIGATION', 'En Investigacion')).toBe(
      i18next.t('caseWorkflow.status.IN_INVESTIGATION'),
    );
  });

  it('devuelve el `fallback` cuando el código es desconocido', () => {
    expect(statusLabel(i18next.t, 'ARCHIVED', 'Archivado')).toBe('Archivado');
  });

  it.each(CASE_WORKFLOW_STATUS_CODES)('tiene una clave propia para %s', (code) => {
    expect(i18next.exists(`caseWorkflow.status.${code}`)).toBe(true);
  });
});
