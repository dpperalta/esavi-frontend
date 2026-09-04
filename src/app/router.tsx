import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogItemListPage } from '@/features/catalogItem/CatalogItemListPage';
import { CatalogTypeListPage } from '@/features/catalogType/CatalogTypeListPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { CaseWizardPage } from '@/features/esaviCase/CaseWizardPage';
import { EsaviCaseDetailPage } from '@/features/esaviCase/EsaviCaseDetailPage';
import { EsaviCaseListPage } from '@/features/esaviCase/EsaviCaseListPage';
import { NewCasePage } from '@/features/esaviCase/NewCasePage';
import { GeoLevelTypeListPage } from '@/features/geoLevelType/GeoLevelTypeListPage';
import { GeoBulkImportPage } from '@/features/geoLocation/GeoBulkImportPage';
import { GeoLocationListPage } from '@/features/geoLocation/GeoLocationListPage';
import { HealthFacilityListPage } from '@/features/healthFacility/HealthFacilityListPage';
import { HomePage } from '@/features/home/HomePage';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { AppShell } from './layout/AppShell';
import { NotFoundPage } from './NotFoundPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            {/* SPEC FE07 §4 paso 8: /geo-locations/import declared before /geo-locations — the
                generic route — so a future param route under /geo-locations never shadows it. */}
            <Route element={<RequireRole level={ROLE_LEVELS.ADMIN} />}>
              <Route path="/geo-locations/import" element={<GeoBulkImportPage />} />
            </Route>
            <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
              <Route path="/catalog-types" element={<CatalogTypeListPage />} />
              <Route path="/catalog-items" element={<CatalogItemListPage />} />
              <Route path="/geo-level-types" element={<GeoLevelTypeListPage />} />
              <Route path="/geo-locations" element={<GeoLocationListPage />} />
              <Route path="/health-facilities" element={<HealthFacilityListPage />} />
              {/* SPEC FE08 §3.1: USER is the real minimum of ESAVI-CASE-001 and of the six
                  caseWorkflow operations the wizard touches (API-ROUTES.md). `:step?` is optional
                  so /esavi-cases/:id/wizard alone resolves to the same page — CaseWizardPage
                  itself redirects to the resume step when `:step` is missing (SPEC FE08 §4). */}
              <Route path="/esavi-cases" element={<EsaviCaseListPage />} />
              {/* SPEC FE09 §3.1: /esavi-cases/new declared before /esavi-cases/:id — the static
                  segment has to win the match, or "new" resolves as a case id and opens the
                  detail page instead of NewCasePage. */}
              <Route path="/esavi-cases/new" element={<NewCasePage />} />
              <Route path="/esavi-cases/:id" element={<EsaviCaseDetailPage />} />
              <Route path="/esavi-cases/:id/wizard/:step?" element={<CaseWizardPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
