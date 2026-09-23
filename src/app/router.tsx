import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogItemListPage } from '@/features/catalogItem/CatalogItemListPage';
import { CatalogTypeListPage } from '@/features/catalogType/CatalogTypeListPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { CaseOpeningStep } from '@/features/esaviCase/CaseOpeningStep';
import { CaseWizardPage } from '@/features/esaviCase/CaseWizardPage';
import { EsaviCaseDetailPage } from '@/features/esaviCase/EsaviCaseDetailPage';
import { EsaviCaseListPage } from '@/features/esaviCase/EsaviCaseListPage';
import { GeoLevelTypeListPage } from '@/features/geoLevelType/GeoLevelTypeListPage';
import { GeoBulkImportPage } from '@/features/geoLocation/GeoBulkImportPage';
import { GeoLocationListPage } from '@/features/geoLocation/GeoLocationListPage';
import { HealthFacilityListPage } from '@/features/healthFacility/HealthFacilityListPage';
import { HomePage } from '@/features/home/HomePage';
import { PatientStep } from '@/features/patient/PatientStep';
import { SystemConfigListPage } from '@/features/systemConfig/SystemConfigListPage';
import { UserDetailPage } from '@/features/user/UserDetailPage';
import { UserListPage } from '@/features/user/UserListPage';
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
              {/* SPEC FE20 §3.1: ADMIN is the real minimum of the whole user group in
                  API-ROUTES.md — the two listings, the search, the detail and the alta. The one
                  SUPERADMIN operation of the screen (ESAVI-USER-005B) is guarded by hiding its
                  button, not by the route: an ADMIN has everything else to do here. */}
              <Route path="/users" element={<UserListPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
            </Route>
            {/* SPEC FE19 §2, §6: desviación declarada del rol mínimo real de ESAVI-SYSCONF-002A
                (USER) — las nueve operaciones útiles de esta pantalla son SUPERADMIN, así que se
                exige el nivel de la pantalla completa, no el de la lectura más baja. */}
            <Route element={<RequireRole level={ROLE_LEVELS.SUPERADMIN} />}>
              <Route path="/system-configs" element={<SystemConfigListPage />} />
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
              {/* SPEC FE09 §3.1 / SPEC FE10 §3.1: /esavi-cases/new/... declared before
                  /esavi-cases/:id — the static segment has to win the match, or "new" resolves
                  as a case id and opens the detail page instead of the alta. No :step? here:
                  the two real slugs are declared explicitly, and any other value falls through
                  to the last route, which resolves it as `patient` without redirecting (SPEC
                  FE10 §3.4) — the same criterion FE09's own `?tab=` already uses. */}
              <Route path="/esavi-cases/new" element={<PatientStep />} />
              <Route path="/esavi-cases/new/patient" element={<PatientStep />} />
              <Route path="/esavi-cases/new/case-opening" element={<CaseOpeningStep />} />
              <Route path="/esavi-cases/new/:step" element={<PatientStep />} />
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
