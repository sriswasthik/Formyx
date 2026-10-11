import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SwitchSettingProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** An on/off setting with a line saying what it does. */
export function SwitchSetting({ id, label, hint, checked, onCheckedChange }: SwitchSettingProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-13 text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
