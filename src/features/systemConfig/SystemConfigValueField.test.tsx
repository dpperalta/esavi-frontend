import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { SystemConfigValueField } from './SystemConfigValueField';

describe('SystemConfigValueField — conmuta por valueType (SPEC FE19 §4 paso 4)', () => {
  it('string renderiza un Input de texto', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField
        valueType="string"
        value="ECU"
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    const input = screen.getByLabelText('Valor');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveValue('ECU');
  });

  it('number renderiza un NumberField', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField valueType="number" value={42} onChange={onChange} ariaLabel="Valor" />,
    );

    expect(screen.getByLabelText('Valor')).toHaveValue('42');
  });

  it('boolean renderiza un Switch', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField
        valueType="boolean"
        value={true}
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    expect(screen.getByRole('switch', { name: 'Valor' })).toBeChecked();
  });

  it('json renderiza un Textarea con el texto crudo', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField
        valueType="json"
        value={'{"a":1}'}
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    const textarea = screen.getByLabelText('Valor');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('{"a":1}');
  });

  it('array renderiza un Textarea con el texto crudo', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField
        valueType="array"
        value={'[1,2,3]'}
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    expect(screen.getByLabelText('Valor')).toHaveValue('[1,2,3]');
  });

  it('escribir en el Textarea de json emite el texto tal cual, sin parsear', () => {
    const onChange = vi.fn();
    render(
      <SystemConfigValueField valueType="json" value="{}" onChange={onChange} ariaLabel="Valor" />,
    );

    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '{ mal' } });

    expect(onChange).toHaveBeenCalledWith('{ mal');
  });

  it('cambiar de json a number reinicia el valor a null, no al texto JSON anterior', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SystemConfigValueField
        valueType="json"
        value={'{"a":1}'}
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    rerender(
      <SystemConfigValueField
        valueType="number"
        value={'{"a":1}'}
        onChange={onChange}
        ariaLabel="Valor"
      />,
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('cambiar de string a array reinicia el valor a "[]"', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SystemConfigValueField valueType="string" value="ECU" onChange={onChange} ariaLabel="Valor" />,
    );

    rerender(
      <SystemConfigValueField valueType="array" value="ECU" onChange={onChange} ariaLabel="Valor" />,
    );

    expect(onChange).toHaveBeenCalledWith('[]');
  });

  it('sin cambio de valueType, no llama a onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SystemConfigValueField valueType="string" value="ECU" onChange={onChange} ariaLabel="Valor" />,
    );

    rerender(
      <SystemConfigValueField valueType="string" value="ECU" onChange={onChange} ariaLabel="Valor" />,
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
