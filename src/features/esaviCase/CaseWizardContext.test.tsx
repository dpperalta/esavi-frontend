import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CaseWizardProvider, useCaseWizard, type CaseWizardStepHandle } from './CaseWizardContext';

function FakeStep({ handle }: { handle: CaseWizardStepHandle }) {
  const { registerStep, unregisterStep } = useCaseWizard();

  useEffect(() => {
    registerStep(handle);
    return () => unregisterStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function Reader() {
  const { isDirty, pendingFields, activeStep } = useCaseWizard();
  return (
    <div>
      <span data-testid="is-dirty">{String(isDirty)}</span>
      <span data-testid="pending-fields">{pendingFields.join(',')}</span>
      <span data-testid="has-active-step">{String(activeStep !== null)}</span>
    </div>
  );
}

describe('CaseWizardContext', () => {
  it('registerStep expone el handle activo y unregisterStep lo limpia al desmontar', () => {
    const handle: CaseWizardStepHandle = {
      save: vi.fn(),
      isDirty: true,
      getPendingFields: () => ['eventDate'],
    };

    const { rerender } = render(
      <CaseWizardProvider>
        <FakeStep handle={handle} />
        <Reader />
      </CaseWizardProvider>,
    );

    expect(screen.getByTestId('has-active-step').textContent).toBe('true');
    expect(screen.getByTestId('is-dirty').textContent).toBe('true');
    expect(screen.getByTestId('pending-fields').textContent).toBe('eventDate');

    rerender(
      <CaseWizardProvider>
        <Reader />
      </CaseWizardProvider>,
    );

    expect(screen.getByTestId('has-active-step').textContent).toBe('false');
    expect(screen.getByTestId('is-dirty').textContent).toBe('false');
    expect(screen.getByTestId('pending-fields').textContent).toBe('');
  });

  it('useCaseWizard fuera del provider lanza', () => {
    function Broken() {
      useCaseWizard();
      return null;
    }
    expect(() => render(<Broken />)).toThrow(
      'useCaseWizard must be used within a CaseWizardProvider',
    );
  });
});
