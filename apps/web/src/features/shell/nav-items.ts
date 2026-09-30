import { FileText, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app/forms', label: 'Forms', icon: FileText },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];
