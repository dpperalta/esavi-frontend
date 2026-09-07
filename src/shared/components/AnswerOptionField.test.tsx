import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { AnswerOptionField } from './AnswerOptionField';

describe('AnswerOptionField', () => {
  it('en variante unknown, un NO_ANSWER leído del servidor se muestra en vez de quedar en blanco (§7.1)', () => {
    render(
      <AnswerOptionField
        value="NO_ANSWER"
        onChange={vi.fn()}
        ariaLabel="Antecedente médico relevante"
        variant="unknown"
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Sin respuesta');
  });

  it('en variante unknown ofrece sólo tres opciones en el menú', async () => {
    const user = setupUser();
    render(
      <AnswerOptionField
        value={null}
        onChange={vi.fn()}
        ariaLabel="Toma medicación"
        variant="unknown"
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Sí' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No se sabe' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Sin respuesta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'No aplica' })).not.toBeInTheDocument();
  });

  it('en variante full ofrece las cinco opciones', async () => {
    const user = setupUser();
    render(
      <AnswerOptionField value={null} onChange={vi.fn()} ariaLabel="Campo completo" variant="full" />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Sí' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No se sabe' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No aplica' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin respuesta' })).toBeInTheDocument();
  });

  it('elegir una opción emite el AnswerOption correspondiente', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(
      <AnswerOptionField
        value={null}
        onChange={onChange}
        ariaLabel="Alergia a otras vacunas"
        variant="unknown"
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'No' }));

    expect(onChange).toHaveBeenCalledWith('NO');
  });
});
