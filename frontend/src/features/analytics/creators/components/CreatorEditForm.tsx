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
import { useTerms } from '../data/queries';
import type { EditMode } from '../state';

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
  const session = useEditSession(scored.creator.id);
  if (session.status === 'opening') return <p className="cc-form-note" data-testid="edit-opening">Opening the edit form…</p>;
  if (session.status === 'blocked') {
    return (
      <div className="cc-form">
        <p className="cc-err cc-err-form" role="alert" data-testid="edit-blocked">
          {session.message}
        </p>
        <div className="cc-form-actions">
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
  const fields = FIELDS.filter((f) => scored.applicable.includes(f.key) && (mode === 'edit' || scored.missing.includes(f.key)));

  // 0 is how the database stores "not known", so it shows as an empty box.
  const countText = (v: number | null) => (v === null || v < 1 ? '' : String(v));
  const [text, setText] = useState<Record<string, string>>(() => ({
    followers: countText(d.followers),
    avg_views: countText(d.avg_views),
    emails: d.emails.filter((x) => x.trim()).join(', '),
    phones: d.phones.filter((x) => x.trim()).join(', '),
    city: norm(d.city),
    state: norm(d.state),
    gender: norm(d.gender),
  }));
  const [lists, setLists] = useState<{ categories: number[]; languages: number[] }>({ categories: d.categories, languages: d.languages });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input, select, button[role="checkbox"]')?.focus({ preventScroll: true });
  }, []);

  const set = (k: string, v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toggle = (k: 'categories' | 'languages', id: number) => {
    setLists((l) => ({ ...l, [k]: l[k].includes(id) ? l[k].filter((x) => x !== id) : [...l[k], id] }));
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
          const orig = d[key].filter((x) => x.trim());
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
          const orig = d[key];
          const changed = [...list].sort((a, b) => a - b).join('|') !== [...orig].sort((a, b) => a - b).join('|');
          if (fill ? list.length > 0 : changed) patch[key] = list;
          break;
        }
      }
    }
    return { patch, errors: errs };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { patch, errors: numErrors } = buildPatch();
    const errs = { ...numErrors, ...validatePatch(patch, c) };
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError('Please fix the highlighted details.');
      return;
    }
    if (Object.keys(patch).length === 0) {
      setFormError(mode === 'fill' ? 'Nothing to save yet. Fill in at least one detail.' : 'No changes to save.');
      return;
    }
    setSaving(true);
    try {
      await creatorEditApi.save(c.id, { version: record.version, ...patch });
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
        } else if (err.status === 403) setFormError('You do not have permission to edit creators.');
        else setFormError(err.detail || 'Could not save. Please try again.');
      } else setFormError('Could not save. Please try again.');
    }
  }

  const genders = GENDERS.includes(text.gender) || !text.gender ? GENDERS : [...GENDERS, text.gender];

  return (
    <form ref={formRef} className="cc-form" onSubmit={submit} noValidate data-testid="edit-form">
      <h3 className="cc-form-title">{mode === 'fill' ? 'Fill missing details' : 'Edit details'}</h3>
      <p className="cc-form-note">
        {mode === 'fill'
          ? `Only the empty details are shown. Leave a box empty to keep it missing.`
          : `Change anything that is wrong. Clearing a box makes that detail missing.`}
      </p>
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
              <div className="cc-chipset" role="group" aria-label={label} id={id} data-testid={id}>
                {(key === 'categories' ? categoryTerms : languageTerms).map((t) => {
                  const on = lists[key].includes(t.id);
                  return (
                    <button key={t.id} type="button" role="checkbox" aria-checked={on} className="cc-pickchip" onClick={() => toggle(key, t.id)}>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                {...common}
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
