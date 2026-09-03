import { Languages, LogOut, Moon, Sun, SunMoon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/shared/components/ui/sidebar';
import { getEffectiveRoleName } from '@/shared/config/roles';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import type { Language, Theme } from '@/shared/stores/preferences.types';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];
const LANGUAGE_OPTIONS: Language[] = ['es', 'en', 'nl'];

const THEME_ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: SunMoon };

// The two preferences exposed in the interface (SPEC FE01 §2): theme and language, plus the
// dismissible change-password dialog and logout — neither assigned to a numbered step, added
// once the shell had no way to leave a session from the UI.
export function Topbar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const ThemeIcon = THEME_ICONS[theme];

  const handleLogout = () => {
    setConfirmLogout(false);
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t(`settings.theme.${theme}`)}>
              <ThemeIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {THEME_OPTIONS.map((option) => (
              <DropdownMenuItem key={option} onSelect={() => setTheme(option)}>
                {t(`settings.theme.${option}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t(`settings.language.${language}`)}>
              <Languages aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGE_OPTIONS.map((option) => (
              <DropdownMenuItem key={option} onSelect={() => setLanguage(option)}>
                {t(`settings.language.${option}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {user &&
          (() => {
            const roleName = getEffectiveRoleName(user.roles);
            return (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {user.displayName}
                {roleName && <Badge>{roleName}</Badge>}
              </span>
            );
          })()}
        <ChangePasswordDialog />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('auth.session.logout')}
          disabled={logout.isPending}
          onClick={() => setConfirmLogout(true)}
        >
          <LogOut aria-hidden="true" />
        </Button>
      </div>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth.session.logoutConfirm')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>{t('auth.session.logout')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
