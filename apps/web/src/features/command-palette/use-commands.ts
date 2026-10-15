import { hasRole } from '@formyx/shared';
import {
  Building2,
  CircleHelp,
  CreditCard,
  FileText,
  Gift,
  LayoutTemplate,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Palette,
  Plus,
  Settings,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSession } from '@/features/auth/session-context';
import { useLogOut } from '@/features/auth/use-session';
import { formOpenPath } from '@/features/forms/form-paths';
import { useFormsList } from '@/features/forms/use-forms';
import type { ThemePreference } from '@/features/theme/theme';
import { useThemeStore } from '@/features/theme/theme-store';
import { useActiveWorkspace } from '@/features/workspaces/use-active-workspace';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';

export const COMMAND_GROUPS = [
  'Forms',
  'Create',
  'Go to',
  'Workspaces',
  'Appearance',
  'Account',
] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface PaletteCommand {
  /** Stable across visits, for the recent list. */
  id: string;
  group: CommandGroup;
  label: string;
  /** Other words it is found by. */
  keywords?: string[];
  icon: LucideIcon;
  /** A colour dot instead of the icon: a form's look. */
  color?: string;
  run: () => void;
}

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Theme like the device', icon: Monitor },
];

/** Everything the command palette can do, for the person and the workspace they are in. */
export function useCommands(): PaletteCommand[] {
  const navigate = useNavigate();
  const { workspaces } = useSession();
  const workspace = useActiveWorkspace();
  const { data } = useFormsList(workspace?.id ?? '');
  const setPreference = useThemeStore((state) => state.setPreference);
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const { mutate: logOut } = useLogOut();
  const forms = data?.forms;

  return useMemo(() => {
    const go = (to: string) => () => {
      void navigate(to);
    };
    const canEdit = workspace ? hasRole(workspace.role, 'EDITOR') : false;
    const owner = workspace?.role === 'OWNER';
    const commands: PaletteCommand[] = [];

    for (const form of forms ?? []) {
      commands.push({
        id: `form:${form.id}`,
        group: 'Forms',
        label: form.title,
        keywords: ['form', form.status.toLowerCase()],
        icon: FileText,
        color: form.theme.colors.primary,
        run: go(formOpenPath(form.id, canEdit)),
      });
    }

    if (workspace && canEdit) {
      commands.push(
        {
          id: 'create:form',
          group: 'Create',
          label: 'Create a form',
          keywords: ['new', 'blank'],
          icon: Plus,
          run: go('/app/forms?new=1'),
        },
        {
          id: 'create:template',
          group: 'Create',
          label: 'Start from a template',
          keywords: ['new', 'templates', 'gallery'],
          icon: LayoutTemplate,
          run: go('/app/forms?new=1'),
        },
      );
    }

    const pages: Omit<PaletteCommand, 'group'>[] = [
      { id: 'go:forms', label: 'Forms', icon: FileText, run: go('/app/forms') },
      ...(workspace
        ? [
            {
              id: 'go:brand-kits',
              label: 'Brand kits',
              icon: Palette,
              run: go('/app/settings/brand-kits'),
            },
            {
              id: 'go:members',
              label: 'Members',
              keywords: ['invite', 'people', 'team'],
              icon: Users,
              run: go('/app/settings/members'),
            },
            ...(owner
              ? [
                  {
                    id: 'go:billing',
                    label: 'Billing',
                    keywords: ['plan', 'upgrade', 'payments'],
                    icon: CreditCard,
                    run: go('/app/settings/billing'),
                  },
                ]
              : []),
            {
              id: 'go:workspace',
              label: 'Workspace settings',
              keywords: ['settings'],
              icon: Settings,
              run: go('/app/settings/workspace'),
            },
          ]
        : []),
      {
        id: 'go:preferences',
        label: 'Preferences',
        keywords: ['settings', 'profile', 'account', 'password'],
        icon: UserRound,
        run: go('/app/settings'),
      },
      {
        id: 'go:referrals',
        label: 'Referrals',
        keywords: ['invite', 'share', 'free month'],
        icon: Gift,
        run: go('/app/settings/referrals'),
      },
      {
        id: 'go:changelog',
        label: 'What’s new',
        keywords: ['changelog', 'updates'],
        icon: Megaphone,
        run: go('/changelog'),
      },
      {
        id: 'go:help',
        label: 'Help centre',
        keywords: ['support', 'guide'],
        icon: CircleHelp,
        run: () => {
          window.open('/help', '_blank', 'noopener');
        },
      },
    ];
    for (const page of pages) commands.push({ ...page, group: 'Go to' });

    for (const other of workspaces) {
      if (other.id === workspace?.id) continue;
      commands.push({
        id: `workspace:${other.id}`,
        group: 'Workspaces',
        label: `Switch to ${other.name}`,
        keywords: ['workspace'],
        icon: Building2,
        run: () => {
          setActiveWorkspaceId(other.id);
          void navigate('/app/forms');
        },
      });
    }

    for (const theme of THEMES) {
      commands.push({
        id: `theme:${theme.value}`,
        group: 'Appearance',
        label: theme.label,
        keywords: ['appearance', 'mode', theme.value],
        icon: theme.icon,
        run: () => {
          setPreference(theme.value);
        },
      });
    }

    commands.push({
      id: 'account:log-out',
      group: 'Account',
      label: 'Log out',
      keywords: ['sign out'],
      icon: LogOut,
      run: () => {
        logOut(undefined, {
          onError: () => {
            toast.error('Could not log out', {
              description: 'Check your connection and try again.',
            });
          },
        });
      },
    });

    return commands;
  }, [forms, workspace, workspaces, navigate, setPreference, setActiveWorkspaceId, logOut]);
}
