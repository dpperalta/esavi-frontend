import { describe, expect, it } from 'vitest';
import { getPendingWorkLayout } from './pendingWorkLayout';

describe('getPendingWorkLayout', () => {
  it('NOTIFIER resalta OPEN, IN_CLASSIFICATION e IN_NOTIFICATION con el orden por defecto', () => {
    const layout = getPendingWorkLayout('NOTIFIER');

    expect([...layout.emphasizedStatuses]).toEqual(['OPEN', 'IN_CLASSIFICATION', 'IN_NOTIFICATION']);
    expect(layout.listOrder).toEqual(['stalled', 'pendingInvestigations']);
  });

  it('INVESTIGATOR pone primero las investigaciones pendientes, sin resaltar tarjetas', () => {
    const layout = getPendingWorkLayout('INVESTIGATOR');

    expect(layout.emphasizedStatuses.size).toBe(0);
    expect(layout.listOrder).toEqual(['pendingInvestigations', 'stalled']);
  });

  it('EVALUATOR resalta IN_FINAL_CLASSIFICATION', () => {
    const layout = getPendingWorkLayout('EVALUATOR');

    expect([...layout.emphasizedStatuses]).toEqual(['IN_FINAL_CLASSIFICATION']);
    expect(layout.listOrder).toEqual(['stalled', 'pendingInvestigations']);
  });

  it.each(['USER', 'ADMIN', 'SUPERADMIN', null])('%s no tiene énfasis y usa el orden por defecto', (role) => {
    const layout = getPendingWorkLayout(role);

    expect(layout.emphasizedStatuses.size).toBe(0);
    expect(layout.listOrder).toEqual(['stalled', 'pendingInvestigations']);
  });

  it('no distingue mayúsculas en el nombre del rol', () => {
    expect([...getPendingWorkLayout('evaluator').emphasizedStatuses]).toEqual(['IN_FINAL_CLASSIFICATION']);
  });
});
