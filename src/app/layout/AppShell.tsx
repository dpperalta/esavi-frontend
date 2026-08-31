import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarProvider } from '@/shared/components/ui/sidebar';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { useUIStore } from '@/shared/stores/uiStore';
import { AppSidebar } from './AppSidebar';
import { Topbar } from './Topbar';

// Wraps every route behind <RequireAuth>. Desktop collapse is controlled by
// preferences.sidebarCollapsed (persisted, ARCHITECTURE.md §5.3); the mobile drawer is
// controlled by uiStore.sidebarOpen (ephemeral, SPEC FE01 §3.4) — both wired into the shadcn
// primitive's own open/openMobile props instead of its internal state.
export function AppShell() {
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = usePreferencesStore((state) => state.setSidebarCollapsed);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const openSidebar = useUIStore((state) => state.openSidebar);
  const closeSidebar = useUIStore((state) => state.closeSidebar);
  const location = useLocation();

  // Closes the mobile drawer on every route change — covers sidebar link clicks as well as
  // any other navigation (back/forward, a redirect), not just an onClick wired per item.
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
      openMobile={sidebarOpen}
      onOpenMobileChange={(open) => (open ? openSidebar() : closeSidebar())}
    >
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
