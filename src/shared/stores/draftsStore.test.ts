import { beforeEach, describe, expect, it } from 'vitest';
import { useDraftsStore } from './draftsStore';

beforeEach(() => {
  useDraftsStore.setState({ drafts: {} });
});

describe('draftsStore', () => {
  it('set followed by clear leaves get undefined', () => {
    const { set, clear } = useDraftsStore.getState();
    set('case-1', 'patient', { names: 'Ana' });
    expect(useDraftsStore.getState().get('case-1', 'patient')).toEqual({ names: 'Ana' });

    clear('case-1', 'patient');
    expect(useDraftsStore.getState().get('case-1', 'patient')).toBeUndefined();
  });

  it('does not clash between two different caseId', () => {
    const { set, get } = useDraftsStore.getState();
    set('case-1', 'patient', { names: 'Ana' });
    set('case-2', 'patient', { names: 'Beto' });

    expect(get('case-1', 'patient')).toEqual({ names: 'Ana' });
    expect(get('case-2', 'patient')).toEqual({ names: 'Beto' });
  });

  it('clearing an unset caseId does not throw', () => {
    const { clear, get } = useDraftsStore.getState();
    expect(() => clear('case-unknown', 'patient')).not.toThrow();
    expect(get('case-unknown', 'patient')).toBeUndefined();
  });
});
