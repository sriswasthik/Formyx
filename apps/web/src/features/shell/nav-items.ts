import { hasRole, type Role } from '@formyx/shared';
import {
  CreditCard,
  FileText,
  Palette,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Whether the item is the current page, for paths beyond its own (e.g. settings tabs). */
  matches: (pathname: string) => boolean;
  /** The role a member needs to see the item. */
  role?: Role;
}

const under = (path: string) => (pathname: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

/** Settings tabs with nav items of their own, so "Settings" is not lit up on them too. */
const OWN_ITEMS = ['/app/settings/members', '/app/settings/brand-kits', '/app/settings/billing'];

/** Forms and the workspace's brand kits. */
export const MAIN_NAV_ITEMS: readonly NavItem[] = [
  { to: '/app/forms', label: 'Forms', icon: FileText, matches: under('/app/forms') },
  {
    to: '/app/settings/brand-kits',
    label: 'Brand kits',
    icon: Palette,
    matches: under('/app/settings/brand-kits'),
  },
];

/** Under "Workspace": who is in it, what it pays and its other settings. */
export const WORKSPACE_NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/app/settings/members',
    label: 'Members',
    icon: Users,
    matches: under('/app/settings/members'),
  },
  {
    to: '/app/settings/billing',
    label: 'Billing',
    icon: CreditCard,
    matches: under('/app/settings/billing'),
    role: 'OWNER',
  },
  {
    to: '/app/settings/workspace',
    label: 'Settings',
    icon: Settings,
    matches: (pathname) =>
      under('/app/settings')(pathname) && !OWN_ITEMS.some((path) => under(path)(pathname)),
  },
];

/** Only for Formyx's own admins. */
export const ADMIN_NAV_ITEM: NavItem = {
  to: '/app/admin',
  label: 'Admin',
  icon: Shield,
  matches: under('/app/admin'),
};

/** The items a member with `role` sees. */
export function visibleItems(items: readonly NavItem[], role: Role | undefined): NavItem[] {
  return items.filter((item) => !item.role || (role !== undefined && hasRole(role, item.role)));
}
