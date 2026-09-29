import type { LucideIcon } from 'lucide-react';
import { PlatformMark } from '@/components/PlatformMark';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/api';
import { PLATFORMS, PLATFORM_LABELS } from '@/lib/enums';


export interface IconFilterOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  platform?: Platform;
  disabled?: boolean;
  iconClassName?: string;

}
const PLATFORM_FILTER_OPTIONS: IconFilterOption[] = PLATFORMS.map((platform) => ({
  value: platform,
  label: PLATFORM_LABELS[platform],
  platform,
}));

interface IconFilterProps {
  options: IconFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function IconFilter({
  options,
  selected,
  onChange,
}: IconFilterProps) {
  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };
  const visibleOptions = options.some((option) => option.platform)
    ? PLATFORM_FILTER_OPTIONS
    : options;

  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-rp-border bg-rp-surface p-1.5">
      {visibleOptions.map((option) => {
        const isSelected = selected.includes(option.value);
        const Icon = option.icon;


        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            disabled={option.disabled}

            aria-pressed={isSelected}
            onClick={() => toggleValue(option.value)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40', isSelected
              ? 'border-rp-primary bg-rp-primary-soft'
              : 'border-rp-border',
            )}
          >
            {Icon ? (
              <Icon className={cn('size-4', option.iconClassName)} />
            ) : option.platform ? (
              <PlatformMark platform={option.platform} size={15} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}