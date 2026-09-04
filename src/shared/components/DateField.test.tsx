import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { DateField } from './DateField';

describe('DateField', () => {
  it('teclear una fecha fija el valor sin abrir el calendario', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de reporte" allowFuture={false} />);

    const input = screen.getByLabelText('Fecha de reporte');
    fireEvent.change(input, { target: { value: '2026-03-01' } });

    expect(onChange).toHaveBeenCalledWith('2026-03-01');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('con allowFuture:false rechaza una fecha futura', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de reporte" allowFuture={false} />);

    const input = screen.getByLabelText('Fecha de reporte');
    fireEvent.change(input, { target: { value: '2099-01-01' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('con allowFuture:true acepta una fecha futura', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de evento" allowFuture={true} />);

    const input = screen.getByLabelText('Fecha de evento');
    fireEvent.change(input, { target: { value: '2099-01-01' } });

    expect(onChange).toHaveBeenCalledWith('2099-01-01');
  });

  it('el valor emitido nunca lleva hora ni zona', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de evento" allowFuture={true} />);

    fireEvent.change(screen.getByLabelText('Fecha de evento'), { target: { value: '2026-05-20' } });

    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('el botón de calendario es alcanzable con el teclado y es un <button> nativo', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de reporte" allowFuture={true} />);

    const trigger = screen.getByRole('button', { name: /Abrir calendario/ });
    trigger.focus();

    expect(trigger).toHaveFocus();
    expect(trigger.tagName).toBe('BUTTON');
  });

  it('activar el botón de calendario abre el calendario', () => {
    const onChange = vi.fn();
    render(<DateField value={null} onChange={onChange} ariaLabel="Fecha de reporte" allowFuture={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Abrir calendario/ }));

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });
});
