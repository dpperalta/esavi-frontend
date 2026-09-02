import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogItemListPage } from '@/features/catalogItem/CatalogItemListPage';
import { CatalogTypeListPage } from '@/features/catalogType/CatalogTypeListPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { GeoLevelTypeListPage } from '@/features/geoLevelType/GeoLevelTypeListPage';
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
            <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
              <Route path="/catalog-types" element={<CatalogTypeListPage />} />
              <Route path="/catalog-items" element={<CatalogItemListPage />} />
              <Route path="/geo-level-types" element={<GeoLevelTypeListPage />} />
              <Route path="/geo-locations" element={<GeoLocationListPage />} />
              <Route path="/health-facilities" element={<HealthFacilityListPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
