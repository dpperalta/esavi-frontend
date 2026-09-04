import '@/shared/config/i18n';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NewCasePage } from './NewCasePage';

function WizardStub() {
  return <div>wizard-classification-reached</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/esavi-cases/new']}>
      <Routes>
        <Route path="/esavi-cases/new" element={<NewCasePage />} />
        <Route path="/esavi-cases/:id/wizard/:step" element={<WizardStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewCasePage', () => {
  it('con un caseId fijo el botón de prueba navega a /esavi-cases/:id/wizard/classification', async () => {
    const user = setupUser();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Prueba: simular creación de caso' }));

    expect(screen.getByText('wizard-classification-reached')).toBeInTheDocument();
  });
});
