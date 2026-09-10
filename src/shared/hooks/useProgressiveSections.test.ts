import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProgressiveSections } from './useProgressiveSections';

// Stands in for the severe branch of step 4: six sections with a button, three revealed together
// by the last advance (SPEC FE12f §3.1).
const SECTIONS = [
  'background',
  'medicalHistory',
  'medications',
  'pregnancy',
  'vaccines',
  'events',
  'description',
  'outcome',
  'observations',
] as const;

type SectionId = (typeof SECTIONS)[number];

function setup(overrides?: { revealAll?: boolean; sections?: SectionId[] }) {
  return renderHook(() =>
    useProgressiveSections<SectionId>({
      sections: overrides?.sections ?? [...SECTIONS],
      revealAll: overrides?.revealAll ?? false,
      lastWithButton: 'events',
    }),
  );
}

describe('useProgressiveSections', () => {
  it('con revealAll muestra todas las secciones y no deja ninguna frontera', () => {
    const { result } = setup({ revealAll: true });

    expect(SECTIONS.every((id) => result.current.isVisible(id))).toBe(true);
    expect(result.current.frontier).toBeNull();
  });

  it('sin revealAll sólo muestra la primera sección, que es la frontera', () => {
    const { result } = setup();

    expect(result.current.isVisible('background')).toBe(true);
    expect(result.current.isVisible('medicalHistory')).toBe(false);
    expect(result.current.frontier).toBe('background');
  });

  it('cada avance revela una sección más y mueve la frontera', () => {
    const { result } = setup();

    act(() => result.current.advance());

    expect(result.current.isVisible('medicalHistory')).toBe(true);
    expect(result.current.isVisible('medications')).toBe(false);
    expect(result.current.frontier).toBe('medicalHistory');

    act(() => result.current.advance());

    expect(result.current.isVisible('medications')).toBe(true);
    expect(result.current.frontier).toBe('medications');
  });

  it('el avance desde lastWithButton revela el resto junto y deja la frontera en null', () => {
    const { result } = setup();

    for (let i = 0; i < 5; i += 1) act(() => result.current.advance());

    expect(result.current.frontier).toBe('events');
    expect(result.current.isVisible('description')).toBe(false);

    act(() => result.current.advance());

    expect(result.current.frontier).toBeNull();
    expect(SECTIONS.every((id) => result.current.isVisible(id))).toBe(true);
  });

  it('un avance de más no rompe nada', () => {
    const { result } = setup();

    for (let i = 0; i < SECTIONS.length + 3; i += 1) act(() => result.current.advance());

    expect(result.current.frontier).toBeNull();
    expect(SECTIONS.every((id) => result.current.isVisible(id))).toBe(true);
  });

  it('una sección que no aplica no es visible y no cuenta como avance', () => {
    const { result } = setup({
      sections: ['background', 'medications', 'vaccines', 'events'],
    });

    act(() => result.current.advance());

    expect(result.current.isVisible('medicalHistory')).toBe(false);
    expect(result.current.frontier).toBe('medications');
  });
});
