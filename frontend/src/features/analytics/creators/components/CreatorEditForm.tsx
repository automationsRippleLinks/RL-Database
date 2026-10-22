import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { creatorEditApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import type { EditRecord } from '@/types/api';
import { FIELDS, PLATFORM_LABEL } from '../rules/config';
import type { ScoredCreator } from '../calculations/score';
import type { ScoredKey } from '../types';
import { parseCount, parseList, validatePatch, type CreatorPatch, type FieldErrors } from '../rules/validate';
import { useEditSession } from '../data/useEditSession';
import { useAuth } from '@/features/auth/useAuth';
import { useTerms } from '../data/queries';
import { useCreatorFacets } from '@/features/search/queries';
import { statesIn } from '@/lib/geo';
import type { EditMode } from '../state';
import { FilterDropdown } from '@/components/FilterDropdown';
import { profileUrlFor } from '@/lib/format';

/** The backend accepts exactly these four. */
const GENDERS = ['Female', 'Male', 'Couple', 'Community'];

interface Props {
  scored: ScoredCreator;
  mode: EditMode;
  /** saved = the change reached the database. The page shows the message and closes the form either way. */
  onDone: (result: { saved: boolean }) => void;
}

/**
 * Opens the edit form on the server first (so nobody else can edit the same creator meanwhile and the
 * save can detect a newer version), then shows the form with the row exactly as the database holds it.
 */
export function CreatorEditForm({ scored, mode, onDone }: Props) {
  const { session, takeOver } = useEditSession(scored.creator.id);
  const { isAdmin } = useAuth();
  if (session.status === 'opening') return <p className="cc-form-note" data-testid="edit-opening">Opening the edit form…</p>;
  if (session.status === 'blocked') {
    return (
      <div className="cc-form">
        <p className="cc-err cc-err-form" role="alert" data-testid="edit-blocked">
          {session.message}
        </p>
        <div className="cc-form-actions">
          {session.locked && isAdmin && (
            <button type="button" className="cc-btn cc-btn-primary" data-testid="take-over" onClick={() => void takeOver()}>
              Take over editing
            </button>
          )}
          <button type="button" className="cc-btn" onClick={() => onDone({ saved: false })}>
            Close
          </button>
        </div>
      </div>
    );
  }
  return <FormBody scored={scored} mode={mode} record={session.record} onDone={onDone} />;
}

const HINTS: Partial<Record<ScoredKey, string>> = {
  emails: 'Separate several with commas.',
  phones: 'With country code if you have it, e.g. +91 98765 43210. Separate several with commas.',
  followers: 'A whole number, 1 or more. Leave empty if you do not know it.',
  avg_views: 'A whole number, 1 or more. Leave empty if you do not know it.',
};

const norm = (v: string | null | undefined) => (v ?? '').trim();

function FormBody({ scored, mode, record, onDone }: Props & { record: EditRecord }) {
  const c = scored.creator;
  const d = record.data;
  const queryClient = useQueryClient();
  const categoryTerms = useTerms('categories').data?.terms ?? [];
  const languageTerms = useTerms('languages').data?.terms ?? [];
  const facets = useCreatorFacets().data;
  const fields = FIELDS.filter((f) => scored.applicable.includes(f.key) && (mode === 'edit' || scored.missing.includes(f.key)));

  // 0 is how the database stores "not known", so it shows as an empty box.
  const countText = (v: number | null) => (v === null || v < 1 ? '' : String(v));
  const [text, setText] = useState<Record<string, string>>(() => ({
    followers: countText(d.followers),
    avg_views: countText(d.avg_views),
    emails: (d.emails ?? []).filter((x) => x.trim()).join(', '),
    phones: (d.phones ?? []).filter((x) => x.trim()).join(', '),
    city: norm(d.city),
    state: norm(d.state),
    gender: norm(d.gender),
  }));
  // Category and language hold ids, as the backend expects; the dropdown shows their names.
  const [lists, setLists] = useState<{ categories: number[]; languages: number[] }>(() => ({
    categories: d.categories ?? [],
    languages: d.languages ?? [],
  }));

  // Username and profile link: everyone with edit rights can see them, only people with the
  // profile-link permission can change them. Switch to the real flag once the backend sends it.
  const canEditProfileLink = false;
  const originalIdentity = { username: c.username ?? '', profile_url: profileUrlFor(c) ?? '' };
  const [identity, setIdentity] = useState(originalIdentity);
  const [identityErrors, setIdentityErrors] = useState<{ username?: string; profile_url?: string }>({});

  const wasActive = d.is_active !== false;
  const [active, setActive] = useState(wasActive);
  const [openList, setOpenList] = useState<'categories' | 'languages' | 'city' | 'state' | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // A click anywhere outside the open list closes it.
  useEffect(() => {
    if (!openList) return;
    const closeOnOutsideClick = (e: MouseEvent) => {
      const box = document.getElementById(`ef-${openList}`);
      if (box && !box.contains(e.target as Node)) setOpenList(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [openList]);

  // Focus the first box that can actually be typed in (read-only ones are skipped).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input:not([readonly]), select, button[role="checkbox"]')?.focus({ preventScroll: true });
  }, []);

  const set = (k: string, v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  // City and State are one pick from the cities already in the database (the current value is always kept in the list).
  const placeOptions = (k: 'city' | 'state') => {
    const base = k === 'city' ? [...(facets?.cities ?? [])] : statesIn(facets?.cities ?? [], []);
    const cur = norm(text[k]);
    const all = cur && !base.includes(cur) ? [...base, cur] : base;
    return all.sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  };
  const pickPlace = (k: 'city' | 'state', names: string[]) => {
    set(k, names.find((n) => n !== norm(text[k])) ?? '');
    setOpenList(null);
  };
  // Category and language boxes hold names; the database holds ids. Until someone types, show the saved names.
  const termsOf = (k: 'categories' | 'languages') => (k === 'categories' ? categoryTerms : languageTerms);
  const namesOf = (k: 'categories' | 'languages') => termsOf(k).filter((t) => lists[k].includes(t.id)).map((t) => t.name);
  const pickNames = (k: 'categories' | 'languages', names: string[]) => {
    setLists((l) => ({ ...l, [k]: termsOf(k).filter((t) => names.includes(t.name)).map((t) => t.id) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  /** Builds the patch of ONLY what changed (edit) or what was newly filled (fill). Returns field errors for bad numbers. */
  function buildPatch(): { patch: CreatorPatch; errors: FieldErrors } {
    const patch: CreatorPatch = {};
    const errs: FieldErrors = {};
    const fill = mode === 'fill';
    for (const { key } of fields) {
      switch (key) {
        case 'followers':
        case 'avg_views': {
          const v = parseCount(text[key]);
          const orig = d[key] !== null && d[key] >= 1 ? d[key] : null;
          if (v === undefined) errs[key] = 'Enter a whole number, 1 or more.';
          else if (fill ? v !== null : v !== orig) patch[key] = v;
          break;
        }
        case 'emails':
        case 'phones': {
          const list = parseList(text[key]);
          const orig = (d[key] ?? []).filter((x) => x.trim());
          if (fill ? list.length > 0 : list.join('\n') !== orig.join('\n')) patch[key] = list;
          break;
        }
        case 'city':
        case 'state':
        case 'gender': {
          const v = norm(text[key]) || null;
          if (fill ? v !== null : v !== (norm(d[key]) || null)) patch[key] = v;
          break;
        }
        case 'categories':
        case 'languages': {
          const list = lists[key];
          const orig = d[key] ?? [];
          const changed = [...list].sort((a, b) => a - b).join('|') !== [...orig].sort((a, b) => a - b).join('|');
          if (fill ? list.length > 0 : changed) patch[key] = list;
          break;
        }
      }
    }
    return { patch, errors: errs };
  }

  const clearAll = () => {
    setText((t) => Object.fromEntries(Object.keys(t).map((k) => [k, ''])));
    setLists({ categories: [], languages: [] });
    setErrors({});
    setFormError(null);
    setOpenList(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { patch, errors: numErrors } = buildPatch();
    const activeChanged = mode === 'edit' && active !== wasActive;
    const errs = { ...numErrors, ...validatePatch(patch, c) };

    // Username / profile link are only checked and sent when this person may change them and something actually changed.
    const identityPatch: { username?: string; profile_url?: string } = {};
    const idErrs: { username?: string; profile_url?: string } = {};
    if (mode === 'edit' && canEditProfileLink) {
      const username = identity.username.trim().replace(/^@/, '').toLowerCase();
      const link = identity.profile_url.trim();
      if (!username) idErrs.username = 'Enter a username.';
      else if (/\s/.test(username)) idErrs.username = 'A username has no space.';
      if (!link) idErrs.profile_url = 'Enter the profile link.';
      else if (!/^https?:\/\/\S+$/i.test(link)) idErrs.profile_url = 'Enter a full link starting with https://';
      if (username && username !== originalIdentity.username.toLowerCase()) identityPatch.username = username;
      if (link && link !== originalIdentity.profile_url) identityPatch.profile_url = link;
    }
    setIdentityErrors(idErrs);

    if (Object.keys(errs).length || Object.keys(idErrs).length) {
      setErrors(errs);
      setFormError('Please fix the highlighted details.');
      return;
    }
    const identityChanged = Object.keys(identityPatch).length > 0;
    if (Object.keys(patch).length === 0 && !activeChanged && !identityChanged) {
      setFormError(mode === 'fill' ? 'Nothing to save yet. Fill in at least one detail.' : 'No changes to save.');
      return;
    }
    setSaving(true);
    try {
      await creatorEditApi.save(c.id, {
        version: record.version,
        ...patch,
        ...identityPatch,
        ...(activeChanged ? { is_active: active } : {}),
      });
      // Every number on the page may have moved: refresh the counts, the table and this creator.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.creatorDetail(c.id) }),
      ]);
      onDone({ saved: true });
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError) {
        if (err.status === 422 && Object.keys(err.fields).length) {
          setErrors(err.fields as FieldErrors);
          setFormError('Please fix the highlighted details.');
        } else if (err.status === 409) {
          // Someone (or an upload) changed this creator after the form opened. Nothing was overwritten.
          setFormError(`${err.detail} Close this form and open it again to see the latest.`);
        } else if (err.status === 403) {
          setFormError('You do not have permission to make this change.');
        } else {
          setFormError(err.detail || 'Could not save. Please try again.');
        }
      } else setFormError('Could not save. Please try again.');
    }
  }

  const genders = GENDERS.includes(text.gender) || !text.gender ? GENDERS : [...GENDERS, text.gender];

  return (
    <form ref={formRef} className="cc-form" onSubmit={submit} noValidate data-testid="edit-form">
      <div className="cc-form-head">
        <h3 className="cc-form-title">{mode === 'fill' ? 'Fill missing details' : 'Edit details'}</h3>
        <button type="button" className="cc-clear" onClick={clearAll} disabled={saving} data-testid="clear-all">
          Clear all
        </button>
      </div>
      <p className="cc-form-note">
        {mode === 'fill'
          ? `Only the empty details are shown. Leave a box empty to keep it missing.`
          : `Change anything that is wrong. Clearing a box makes that detail missing.`}
      </p>
      {mode === 'edit' && (
        <div className="cc-ff cc-switch-row">
          <span className="cc-fl-label" id="ef-active-label">
            Profile active
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-labelledby="ef-active-label"
            className="cc-switch"
            data-testid="ef-is_active"
            onClick={() => setActive((a) => !a)}
          />
          <p className="cc-hint">
            {active ? 'Shown in search and refreshed from the platform.' : 'Profile is gone. Hidden from search and not refreshed.'}
          </p>
        </div>
      )}
      {mode === 'edit' &&
        (['username', 'profile_url'] as const).map((k) => {
          const id = `ef-${k}`;
          const err = identityErrors[k];
          return (
            <div className="cc-ff" key={k}>
              <label htmlFor={id} className="cc-fl-label">
                {k === 'username' ? 'Username' : 'Profile link'}
              </label>
              <input
                id={id}
                data-testid={id}
                type="text"
                autoComplete="off"
                value={identity[k]}
                readOnly={!canEditProfileLink}
                aria-readonly={!canEditProfileLink}
                aria-invalid={!!err}
                title={canEditProfileLink ? undefined : 'You do not have permission to change this'}
                className={canEditProfileLink ? undefined : 'cursor-not-allowed opacity-70'}
                onChange={(e) => {
                  setIdentity((i) => ({ ...i, [k]: e.target.value }));
                  setIdentityErrors((x) => ({ ...x, [k]: undefined }));
                }}
              />
              {!canEditProfileLink && k === 'username' && (
                <p className="cc-hint">Only people with the profile-link permission can change this.</p>
              )}
              {canEditProfileLink && k === 'profile_url' && (
                <p className="cc-hint">The platform and username are read from this link, so they must match.</p>
              )}
              {err && (
                <p className="cc-err" role="alert">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      {fields.map(({ key, label }) => {
        const id = `ef-${key}`;
        const err = errors[key];
        const common = { id, 'aria-invalid': !!err, 'aria-describedby': err ? `${id}-err` : HINTS[key] ? `${id}-hint` : undefined } as const;
        return (
          <div className="cc-ff" key={key}>
            <label htmlFor={id} className="cc-fl-label">
              {label}
              {mode === 'fill' && <span className="cc-tag cc-tag-sm">Missing</span>}
            </label>
            {key === 'gender' ? (
              <select {...common} data-testid={id} value={text.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Not set</option>
                {genders.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            ) : key === 'categories' || key === 'languages' ? (
              // Escape closes the list, not the whole form.
              <div
                {...common}
                data-testid={id}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && openList) {
                    e.stopPropagation();
                    setOpenList(null);
                  }
                }}
              >
                <FilterDropdown
                  label={label}
                  hideLabel
                  chips
                  searchable
                  allowAny={false}
                  options={termsOf(key).map((t) => ({ value: t.name, label: t.name }))}
                  selected={namesOf(key)}
                  onChange={(names) => pickNames(key, names)}
                  open={openList === key}
                  onToggle={() => setOpenList((o) => (o === key ? null : key))}
                  emptyHint={`No ${label.toLowerCase()} names yet. Add them on the Tags page.`}
                />
              </div>
            ) : key === 'city' || key === 'state' ? (
              // Escape closes the list, not the whole form.
              <div
                id={id}
                data-testid={id}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && openList) {
                    e.stopPropagation();
                    setOpenList(null);
                  }
                }}
              >
                <FilterDropdown
                  label={label}
                  hideLabel
                  chips
                  searchable
                  allowAny={false}
                  options={placeOptions(key)}
                  selected={norm(text[key]) ? [norm(text[key])] : []}
                  onChange={(names) => pickPlace(key, names)}
                  open={openList === key}
                  onToggle={() => setOpenList((o) => (o === key ? null : key))}
                  emptyHint="No places loaded yet."
                />
              </div>
            ) : (
              <input
                data-testid={id}
                type="text"
                inputMode={key === 'followers' || key === 'avg_views' ? 'numeric' : key === 'emails' ? 'email' : key === 'phones' ? 'tel' : 'text'}
                autoComplete="off"
                value={text[key] ?? ''}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
            {HINTS[key] && !err && (
              <p className="cc-hint" id={`${id}-hint`}>
                {HINTS[key]}
              </p>
            )}
            {err && (
              <p className="cc-err" id={`${id}-err`} role="alert">
                {err}
              </p>
            )}
          </div>
        );
      })}

      {scored.applicable.length < FIELDS.length && mode === 'edit' && (
        <p className="cc-hint">Avg views does not apply to {PLATFORM_LABEL[c.platform] ?? c.platform}, so it is not shown.</p>
      )}

      {formError && (
        <p className="cc-err cc-err-form" role="alert" data-testid="form-error">
          {formError}
        </p>
      )}

      <div className="cc-form-actions">
        <button type="submit" className="cc-btn cc-btn-primary" disabled={saving} data-testid="save">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="cc-btn" disabled={saving} onClick={() => onDone({ saved: false })} data-testid="cancel-edit">
          Cancel
        </button>
      </div>
    </form>
  );
}