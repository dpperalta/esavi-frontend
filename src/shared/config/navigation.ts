import {
  Beaker,
  Bell,
  BellRing,
  Building2,
  ClipboardList,
  FileText,
  Home,
  Layers,
  ListChecks,
  ListTree,
  MapPin,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Stethoscope,
  Syringe,
  Tags,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LEVELS } from './roles';

// ARCHITECTURE.md §5.1. `path` + `minLevel` mark a navigable leaf; `children` marks a group,
// which carries no minLevel of its own — its visibility is entirely derived from whether it
// still has a visible child after filterNavigationByLevel runs.
export interface NavItem {
  key: string;
  icon: LucideIcon;
  path?: string;
  minLevel?: number;
  // Rendered visible but non-navigable, with a "coming soon" mark (SPEC FE01 §3.1) — the 17
  // entities that don't have a screen yet. Never affects role filtering.
  disabled?: boolean;
  children?: NavItem[];
}

// The tree of SPEC FE01 §3.1, copied field for field: each minLevel is the real minimum role
// of that entity's listing route in API-ROUTES.md, not a guess (CONVENTIONS.md §5).
export const NAVIGATION: NavItem[] = [
  { key: 'nav.home', icon: Home, path: '/', minLevel: ROLE_LEVELS.ANALYTICS },
  {
    key: 'nav.groups.cases',
    icon: ClipboardList,
    children: [
      {
        key: 'nav.items.esaviCase',
        icon: FileText,
        path: '/esavi-cases',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.patient',
        icon: Users,
        path: '/patients',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.finalClassification',
        icon: Tags,
        path: '/final-classifications',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
  {
    key: 'nav.groups.notification',
    icon: Bell,
    children: [
      {
        key: 'nav.items.notification',
        icon: BellRing,
        path: '/notifications',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.notifier',
        icon: UserCheck,
        path: '/notifiers',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
  {
    key: 'nav.groups.investigation',
    icon: Search,
    children: [
      {
        key: 'nav.items.investigation',
        icon: Search,
        path: '/investigations',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
  {
    key: 'nav.groups.clinicalCatalogs',
    icon: Stethoscope,
    children: [
      {
        key: 'nav.items.diagnosticTerm',
        icon: Stethoscope,
        path: '/diagnostic-terms',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.whodrugVaccine',
        icon: Syringe,
        path: '/whodrug-vaccines',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.diluent',
        icon: Beaker,
        path: '/diluents',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
  {
    key: 'nav.groups.geography',
    icon: MapPin,
    children: [
      {
        key: 'nav.items.geoLevelType',
        icon: Layers,
        path: '/geo-level-types',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.geoLocation',
        icon: MapPin,
        path: '/geo-locations',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.healthFacility',
        icon: Building2,
        path: '/health-facilities',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
  {
    key: 'nav.groups.administration',
    icon: Settings,
    children: [
      {
        key: 'nav.items.user',
        icon: UserCog,
        path: '/users',
        minLevel: ROLE_LEVELS.ADMIN,
        disabled: true,
      },
      {
        key: 'nav.items.appRole',
        icon: ShieldCheck,
        path: '/roles',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
      {
        key: 'nav.items.catalogType',
        icon: ListTree,
        path: '/catalog-types',
        minLevel: ROLE_LEVELS.USER,
      },
      {
        key: 'nav.items.catalogItem',
        icon: ListChecks,
        path: '/catalog-items',
        minLevel: ROLE_LEVELS.USER,
      },
      {
        key: 'nav.items.systemConfig',
        icon: Sliders,
        path: '/system-config',
        minLevel: ROLE_LEVELS.USER,
        disabled: true,
      },
    ],
  },
];

// Filters by role level (ARCHITECTURE.md §4.4 — UX, not security). A group with zero visible
// children after filtering is dropped entirely; a leaf is kept when the user's level meets
// its minLevel, independent of `disabled`.
export function filterNavigationByLevel(items: NavItem[], level: number): NavItem[] {
  return items.reduce<NavItem[]>((visible, item) => {
    if (item.children) {
      const children = filterNavigationByLevel(item.children, level);
      if (children.length > 0) {
        visible.push({ ...item, children });
      }
      return visible;
    }
    if (item.minLevel !== undefined && level >= item.minLevel) {
      visible.push(item);
    }
    return visible;
  }, []);
}
