import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { NotFoundPage } from './NotFoundPage';

// Temporary stand-in for "/" until features/home/HomePage.tsx lands in SPEC FE01 step 12.
function HomePlaceholder() {
  return <div>ESAVI</div>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePlaceholder />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
