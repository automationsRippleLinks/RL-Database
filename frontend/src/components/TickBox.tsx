import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

/**
 * The row-selection checkbox used by every results table (Creator, Brand,
 * and — as the same tables get built — Campaign and Pitch). Pulled out once
 * it was about to be copy-pasted a third time: same markup, same behavior,
 * only the click handler differs per table.
 */
export function TickBox({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex size-3.75 cursor-pointer items-center justify-center rounded border-[1.5px] align-middle transition-colors',
        checked ? 'border-rp-primary bg-rp-primary text-rp-primary-fg' : 'border-rp-box',
      )}
    >
      <HugeiconsIcon
        icon={CheckIcon}
        className={cn('size-2.75', !checked && 'opacity-0')}
        strokeWidth={3.4}
      />
    </button>
  );
}
