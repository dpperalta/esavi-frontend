import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { TimeField } from './TimeField';

describe('TimeField', () => {
  it('acepta 08:30', () => {
    const onChange = vi.fn();
    render(<TimeField value={null} onChange={onChange} ariaLabel="Hora de inicio" />);

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '08:30' } });

    expect(onChange).toHaveBeenCalledWith('08:30');
    expect(screen.queryByText(/no es válida/)).not.toBeInTheDocument();
  });

  it('rechaza 25:00', () => {
    const onChange = vi.fn();
    render(<TimeField value={null} onChange={onChange} ariaLabel="Hora de inicio" />);

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '25:00' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/no es válida/)).toBeInTheDocument();
  });

  it('muestra 08:30:00 que venga del servidor sin perderlo', () => {
    const onChange = vi.fn();
    render(<TimeField value="08:30:00" onChange={onChange} ariaLabel="Hora de inicio" />);

    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('08:30');
  });

  it('vaciar el campo emite null', () => {
    const onChange = vi.fn();
    render(<TimeField value="08:30" onChange={onChange} ariaLabel="Hora de inicio" />);

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
