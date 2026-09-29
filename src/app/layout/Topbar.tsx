import { Languages, LogOut, Moon, Sun, SunMoon, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCurrentUser, useLogout, useLogoutAll } from '@/features/auth/api';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
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
import { getEffectiveRoleName, ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
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
  const logoutAll = useLogoutAll();
  // ESAVI-AUTH-004 requires USER (API-ROUTES.md:91); offering it to ANALYTICS would only 403.
  const canLogoutAll = useCan(ROLE_LEVELS.USER);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  const ThemeIcon = THEME_ICONS[theme];

  const handleLogout = () => {
    setConfirmLogout(false);
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  const handleLogoutAll = () => {
    if (logoutAll.isPending) return;
    logoutAll.mutate(undefined, {
      onSuccess: (revokedCount) => {
        navigate('/login', { replace: true });
        toast.success(t('auth.session.logoutAllDone', { count: revokedCount }));
      },
      onError: (error) => {
        setConfirmLogoutAll(false);
        toast.error(
          error instanceof EsaviApiError ? getErrorMessage(error) : t('common.errors.unexpected'),
        );
      },
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
              <>
                {/* < md (SPEC FE15 §3.3): nombre, insignia y «Cambiar contraseña» viven dentro de
                    este menú en vez de sueltos en la barra, que desborda por debajo de md. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-touch"
                      className="md:hidden"
                      aria-label={t('shell.userMenu.trigger')}
                    >
                      <User aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="flex items-center gap-2 px-1.5 py-1 text-sm text-muted-foreground">
                      <span>{user.displayName}</span>
                      {roleName && <Badge>{roleName}</Badge>}
                    </div>
                    <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                      <ChangePasswordDialog />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* >= md: sin cambios respecto a hoy, sueltos en la barra. */}
                <div className="hidden items-center gap-1 md:flex">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {user.displayName}
                    {roleName && <Badge>{roleName}</Badge>}
                  </span>
                  <ChangePasswordDialog />
                </div>
              </>
            );
          })()}
        {/* Same menu at every width (SPEC FE27 §3.7): the trigger was already visible in both. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('shell.sessionMenu.trigger')}
              disabled={logout.isPending || logoutAll.isPending}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setConfirmLogout(true)}>
              {t('auth.session.logout')}
            </DropdownMenuItem>
            {canLogoutAll && (
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmLogoutAll(true)}>
                {t('auth.session.logoutAll')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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

      <AlertDialog
        open={confirmLogoutAll}
        onOpenChange={(open) => {
          if (!open && !logoutAll.isPending) setConfirmLogoutAll(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth.session.logoutAll')}</AlertDialogTitle>
            <AlertDialogDescription>{t('auth.session.logoutAllConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch" disabled={logoutAll.isPending}>
              {t('common.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              size="touch"
              variant="destructive"
              disabled={logoutAll.isPending}
              onClick={(event) => {
                // Radix closes the dialog on Action click; kept open so `isPending` is visible
                // and a double click can't fire a second request (SPEC FE27 §3.5).
                event.preventDefault();
                handleLogoutAll();
              }}
            >
              {t('auth.session.logoutAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
