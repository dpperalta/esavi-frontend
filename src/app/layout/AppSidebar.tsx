import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar';
import { NAVIGATION, filterNavigationByLevel, type NavItem } from '@/shared/config/navigation';
import { getEffectiveLevel } from '@/shared/config/roles';

interface NavLeafProps {
  item: NavItem;
  active: boolean;
}

function NavLeaf({ item, active }: NavLeafProps) {
  const { t } = useTranslation();
  const Icon = item.icon;

  if (item.disabled) {
    // aria-disabled, not the native `disabled` attribute — a disabled item stays focusable
    // and announced by a screen reader as existing, just unavailable (SPEC FE01 §3.7).
    return (
      <SidebarMenuButton
        aria-disabled="true"
        tabIndex={0}
        tooltip={t(item.key)}
        className="cursor-not-allowed opacity-60"
      >
        <Icon />
        <span>{t(item.key)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{t('common.comingSoon')}</span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton asChild isActive={active} tooltip={t(item.key)}>
      <Link to={item.path!}>
        <Icon />
        <span>{t(item.key)}</span>
      </Link>
    </SidebarMenuButton>
  );
}

// The six groups of ARCHITECTURE.md §5.2, filtered by the effective role level. AppShell
// closes the mobile drawer on every route change, so nothing here needs to know about that.
export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: user } = useCurrentUser();

  const level = user ? getEffectiveLevel(user.roles) : 0;
  const items = filterNavigationByLevel(NAVIGATION, level);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {items.map((item) => (
          <SidebarGroup key={item.key}>
            {item.children && <SidebarGroupLabel>{t(item.key)}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {item.children ? (
                  item.children.map((child) => (
                    <SidebarMenuItem key={child.key}>
                      <NavLeaf item={child} active={location.pathname === child.path} />
                    </SidebarMenuItem>
                  ))
                ) : (
                  <SidebarMenuItem>
                    <NavLeaf item={item} active={location.pathname === item.path} />
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
