import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { Input } from '@/shared/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from './ResourceForm';

const schema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, 'Requerido'),
});
type FormValues = z.infer<typeof schema>;

function renderForm(props: Partial<React.ComponentProps<typeof ResourceForm<FormValues>>> = {}) {
  return render(
    <ResourceForm<FormValues>
      schema={schema}
      defaultValues={{ code: '', name: '' }}
      onSubmit={() => {}}
      {...props}
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </ResourceForm>,
  );
}

describe('ResourceForm — mapeo de errores del backend', () => {
  it('un 409 con CATTYPE_001_CODE_EXISTS marca el campo code y no dispara onUnmappedError', () => {
    const onUnmappedError = vi.fn();
    const error = new EsaviApiError(
      'Ya existe un tipo de catálogo con ese código.',
      409,
      'CATTYPE_001_CODE_EXISTS',
    );

    renderForm({
      error,
      errorFieldMap: { CATTYPE_001_CODE_EXISTS: 'code' },
      onUnmappedError,
    });

    expect(screen.getByText('Ya existe un tipo de catálogo con ese código.')).toBeInTheDocument();
    expect(onUnmappedError).not.toHaveBeenCalled();
  });

  it('un code no mapeado dispara onUnmappedError y no marca ningún campo', () => {
    const onUnmappedError = vi.fn();
    const error = new EsaviApiError('Fallo inesperado.', 500, 'CATTYPE_001_CREATION_FAILED');

    renderForm({
      error,
      errorFieldMap: { CATTYPE_001_CODE_EXISTS: 'code' },
      onUnmappedError,
    });

    expect(screen.queryByText('Fallo inesperado.')).not.toBeInTheDocument();
    expect(onUnmappedError).toHaveBeenCalledWith(error);
  });
});

describe('ResourceForm — acciones', () => {
  it('renderiza los botones Guardar y Cancelar traducidos', () => {
    renderForm({ onCancel: () => {} });

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});
