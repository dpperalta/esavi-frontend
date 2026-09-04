import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// The contract between the armazón and each step (SPEC FE08 §3.5). FE08 defines it and never
// implements it — the six steps are placeholders until FE10-FE14 register a real handle.
export interface CaseWizardStepHandle {
  save: () => Promise<void>;
  isDirty: boolean;
  getPendingFields: () => string[];
}

interface CaseWizardContextValue {
  activeStep: CaseWizardStepHandle | null;
  isDirty: boolean;
  pendingFields: string[];
  registerStep: (handle: CaseWizardStepHandle) => void;
  unregisterStep: () => void;
}

const CaseWizardContext = createContext<CaseWizardContextValue | null>(null);

export function CaseWizardProvider({ children }: { children: ReactNode }) {
  const [activeStep, setActiveStep] = useState<CaseWizardStepHandle | null>(null);

  const registerStep = useCallback((handle: CaseWizardStepHandle) => setActiveStep(handle), []);
  const unregisterStep = useCallback(() => setActiveStep(null), []);

  const value = useMemo<CaseWizardContextValue>(
    () => ({
      activeStep,
      isDirty: activeStep?.isDirty ?? false,
      pendingFields: activeStep?.getPendingFields() ?? [],
      registerStep,
      unregisterStep,
    }),
    [activeStep, registerStep, unregisterStep],
  );

  return <CaseWizardContext.Provider value={value}>{children}</CaseWizardContext.Provider>;
}

export function useCaseWizard(): CaseWizardContextValue {
  const context = useContext(CaseWizardContext);
  if (!context) {
    throw new Error('useCaseWizard must be used within a CaseWizardProvider');
  }
  return context;
}
