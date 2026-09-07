import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDraftConflict, useDraftsStore } from './draftsStore';

beforeEach(() => {
  localStorage.clear();
  useDraftsStore.setState({ drafts: {} });
});

describe('draftsStore', () => {
  it('set followed by clear leaves get undefined', () => {
    const { set, clear } = useDraftsStore.getState();
    set('case-1', 'notification', { esaviDescription: 'algo' }, null);
    expect(useDraftsStore.getState().get('case-1', 'notification')?.values).toEqual({
      esaviDescription: 'algo',
    });

    clear('case-1', 'notification');
    expect(useDraftsStore.getState().get('case-1', 'notification')).toBeUndefined();
  });

  it('does not clash between two different caseId', () => {
    const { set, get } = useDraftsStore.getState();
    set('case-1', 'notification', { esaviDescription: 'Ana' }, null);
    set('case-2', 'notification', { esaviDescription: 'Beto' }, null);

    expect(get('case-1', 'notification')?.values).toEqual({ esaviDescription: 'Ana' });
    expect(get('case-2', 'notification')?.values).toEqual({ esaviDescription: 'Beto' });
  });

  it('clearing an unset caseId does not throw', () => {
    const { clear, get } = useDraftsStore.getState();
    expect(() => clear('case-unknown', 'notification')).not.toThrow();
    expect(get('case-unknown', 'notification')).toBeUndefined();
  });

  it('set carries baseUpdatedAt and a savedAt timestamp', () => {
    const { set, get } = useDraftsStore.getState();
    set('case-1', 'notification', { esaviDescription: 'algo' }, '2026-09-01T00:00:00.000Z');

    const draft = get('case-1', 'notification');
    expect(draft?.baseUpdatedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(typeof draft?.savedAt).toBe('string');
  });

  it('clearAll empties every caseId and removes the localStorage key (SPEC FE12a §3.4)', () => {
    const { set, clearAll } = useDraftsStore.getState();
    set('case-1', 'notification', { esaviDescription: 'algo' }, null);
    set('case-2', 'classification', { isSeriousEvent: true }, null);
    expect(localStorage.getItem('esavi-drafts')).not.toBeNull();

    clearAll();

    expect(useDraftsStore.getState().drafts).toEqual({});
    expect(localStorage.getItem('esavi-drafts')).toBeNull();
  });

  describe('resolveDraftConflict — la tabla de §3.4', () => {
    it('sin borrador, se usa la fila', () => {
      expect(resolveDraftConflict(undefined, '2026-09-01T00:00:00.000Z')).toBe('noDraft');
      expect(resolveDraftConflict(undefined, null)).toBe('noDraft');
    });

    it('con borrador y baseUpdatedAt igual al updatedAt de la fila, se restaura', () => {
      const draft = { values: {}, baseUpdatedAt: '2026-09-01T00:00:00.000Z', savedAt: 'x' };
      expect(resolveDraftConflict(draft, '2026-09-01T00:00:00.000Z')).toBe('restore');
    });

    it('con borrador y updatedAt de la fila distinto, gana la fila', () => {
      const draft = { values: {}, baseUpdatedAt: '2026-09-01T00:00:00.000Z', savedAt: 'x' };
      expect(resolveDraftConflict(draft, '2026-09-02T00:00:00.000Z')).toBe('discard');
    });

    it('con borrador sin fila (baseUpdatedAt null) y ahora existe fila, gana la fila', () => {
      const draft = { values: {}, baseUpdatedAt: null, savedAt: 'x' };
      expect(resolveDraftConflict(draft, '2026-09-01T00:00:00.000Z')).toBe('discard');
    });

    it('con borrador sin fila y sigue sin fila, se restaura', () => {
      const draft = { values: {}, baseUpdatedAt: null, savedAt: 'x' };
      expect(resolveDraftConflict(draft, null)).toBe('restore');
    });
  });
});
