import { Globe, Lock, Users, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ListAccessLevel, ListShare, ListVisibility, TeamRef } from '@/types/api';

/** Who can open a list, in words. */
export function visibilityLabel(v: ListVisibility, team: TeamRef | null, shares: ListShare[] = []) {
  if (v === 'private') return 'Private';
  if (v === 'people') return shares.length === 1 ? '1 person' : `${shares.length} people`;
  if (v === 'team') return team ? team.name : 'Team';
  return 'Everyone';
}

export const VIS_ICON: Record<ListVisibility, typeof Lock> = { private: Lock, people: UsersRound, team: Users, everyone: Globe };

/**
 * "Private", "Sales North · view", "2 people". The level is shown only when the
 * audience can't edit, because edit is the normal case.
 */
export function VisibilityPill({
  visibility,
  team,
  shares = [],
  level = 'edit',
  className,
}: {
  visibility: ListVisibility;
  team: TeamRef | null;
  shares?: ListShare[];
  level?: ListAccessLevel;
  className?: string;
}) {
  const Icon = VIS_ICON[visibility];
  const showLevel = (visibility === 'team' || visibility === 'everyone') && level === 'view';
  const title =
    visibility === 'private'
      ? 'Private: only the owner opens it'
      : visibility === 'people'
        ? `Shared with ${shares.map((s) => `${s.user.name} (${s.level === 'edit' ? 'can edit' : 'can view'})`).join(', ')}`
        : visibility === 'team'
          ? `${team?.name ?? 'The team'} ${level === 'edit' ? 'can edit' : 'can view'} (admins too)`
          : `Everyone ${level === 'edit' ? 'can edit' : 'can view'}`;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.25 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap',
        visibility === 'private'
          ? 'bg-rp-surface2 text-rp-muted'
          : visibility === 'everyone'
            ? 'bg-[color-mix(in_oklch,var(--rp-success)_13%,transparent)] text-rp-success'
            : 'bg-rp-primary-soft text-rp-primary',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {visibilityLabel(visibility, team, shares)}
      {showLevel && <span className="font-medium opacity-75">· view</span>}
    </span>
  );
}

/**
 * Who can open the list, as radio cards. `teamName` null = this person has no team,
 * so the team card is unavailable. `withPeople` adds the "Specific people" card
 * (the Share dialog has it; the quick create dialogs don't, because picking people
 * needs the full Share dialog).
 */
export function VisibilityPicker({
  value,
  onChange,
  teamName,
  disabledReason,
  withPeople = false,
  ownerIsYou = true,
  legend = 'Who can open it',
}: {
  value: ListVisibility;
  onChange: (v: ListVisibility) => void;
  teamName: string | null;
  disabledReason?: string | null;
  withPeople?: boolean;
  /** False when an admin edits someone else's list: "Only the owner" instead of "Only you". */
  ownerIsYou?: boolean;
  legend?: string;
}) {
  const options: { v: ListVisibility; title: string; desc: string; off?: string | null }[] = [
    { v: 'private', title: 'Private', desc: ownerIsYou ? 'Only you' : 'Only the owner' },
    ...(withPeople ? [{ v: 'people' as const, title: 'Specific people', desc: 'People you pick' }] : []),
    { v: 'team', title: 'My team', desc: teamName ?? 'You are not in a team yet', off: teamName ? null : 'Ask an admin to add you to a team.' },
    { v: 'everyone', title: 'Everyone', desc: 'All of Ripple Links' },
  ];
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={!!disabledReason}>
      <legend className="mb-1.5 text-[12px] font-semibold">{legend}</legend>
      <div className={cn('grid gap-1.5', options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-3')}>
        {options.map((o) => {
          const Icon = VIS_ICON[o.v];
          return (
            <label
              key={o.v}
              title={o.off ?? undefined}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-xl border p-2.5 has-disabled:cursor-not-allowed has-disabled:opacity-50',
                value === o.v ? 'border-rp-primary bg-rp-primary-soft' : 'border-rp-border hover:bg-rp-surface2',
              )}
            >
              <input type="radio" name="list-visibility" className="sr-only" value={o.v} checked={value === o.v} disabled={!!o.off} onChange={() => onChange(o.v)} />
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Icon className="size-3.5" aria-hidden="true" />{o.title}</span>
              <span className="truncate text-[11.5px] text-rp-muted">{o.desc}</span>
            </label>
          );
        })}
      </div>
      {disabledReason && <p className="text-[11.5px] text-rp-muted">{disabledReason}</p>}
    </fieldset>
  );
}

/** "Can view / Can edit" as a small select. */
export function LevelSelect({ value, onChange, label, disabled }: { value: ListAccessLevel; onChange: (v: ListAccessLevel) => void; label: string; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ListAccessLevel)}
      className="cursor-pointer rounded-lg border border-rp-border bg-rp-bg px-2 py-1.5 text-[12.5px] font-semibold outline-none focus:border-rp-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="view">Can view</option>
      <option value="edit">Can edit</option>
    </select>
  );
}
