import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { BrandRef } from '@/types/api';

/**
 * Sidebar shell for the per-scope filter controls. Sticky on desktop so filters
 * stay reachable while scrolling a long result set; collapsible on narrow screens
 * where it would otherwise push the results off the page.
 */
export function FilterPanel({
  children,
  footer,
  open = true,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        'shrink-0 lg:w-64 lg:sticky lg:top-4 lg:self-start',
        open ? 'block' : 'hidden lg:block',
        className,
      )}
    >
      <div className="space-y-4 rounded-lg border border-border bg-card p-3.5">
        {children}
        {footer && <div className="border-t border-border pt-3">{footer}</div>}
      </div>
    </aside>
  );
}

export function FilterCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="cursor-pointer text-xs text-foreground">
        {label}
      </Label>
    </div>
  );
}

/** Turn a facet vocabulary into options, with an optional label/hint mapper. */
export function toOptions<T extends string | number>(
  values: readonly T[] | undefined,
  labels?: Partial<Record<T, string>>,
  hints?: Partial<Record<T, string>>,
) {
  return (values ?? []).map((value) => ({
    value: String(value),
    label: labels?.[value] ?? String(value),
    hint: hints?.[value],
  }));
}

/**
 * Brand facets submit `brand.id` but display the name — brands are a real table now,
 * so filtering by name would be both ambiguous and slower than filtering by key.
 */
export function brandOptions(brands: readonly BrandRef[] | undefined) {
  return (brands ?? []).map((brand) => ({
    value: String(brand.id),
    label: brand.name,
  }));
}
