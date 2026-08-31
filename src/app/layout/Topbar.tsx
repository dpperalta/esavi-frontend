import { Languages, Moon, Sun, SunMoon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/api';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/shared/components/ui/sidebar';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import type { Language, Theme } from '@/shared/stores/preferences.types';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];
const LANGUAGE_OPTIONS: Language[] = ['es', 'en', 'nl'];

const THEME_ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: SunMoon };

// The two preferences exposed in the interface (SPEC FE01 §2): theme and language. The change
// password / logout menu lands here too, in step 13 — not yet.
export function Topbar() {
  const { t } = useTranslation();
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const { data: user } = useCurrentUser();

  const ThemeIcon = THEME_ICONS[theme];

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
        {user && <span className="text-sm text-muted-foreground">{user.displayName}</span>}
      </div>
    </header>
  );
}
