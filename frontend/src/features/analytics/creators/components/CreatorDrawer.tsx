import { useEffect, useRef } from 'react';
import { FIELDS, PLATFORM_LABEL } from '../rules/config';
import { isFieldMissing } from '../rules/missing';
import type { ScoredCreator } from '../calculations/score';
import type { CreatorRow, ScoredKey } from '../types';
import { fmtN } from '../calculations/format';
import { CloseIcon } from './Icons';
import type { EditMode } from '../state';
import { CreatorEditForm } from './CreatorEditForm';

interface Props {
  scored: ScoredCreator | null;
  /** From the logged-in session (/auth/me). The backend checks it again on every save. */
  canEdit: boolean;
  edit: EditMode | null;
  onStartEdit: (mode: EditMode) => void;
  /** The form closed. `saved` = the change reached the database. */
  onEditDone: (result: { saved: boolean }) => void;
  onClose: () => void;
}

function Value({ c, k }: { c: CreatorRow; k: ScoredKey }) {
  const v = c[k];
  if (k === 'followers' || k === 'avg_views') return <>{fmtN(v as number | null)}</>;
  if (Array.isArray(v)) return <>{v.filter((x) => x.trim()).join(', ')}</>;
  return <>{v}</>;
}

/** Slide-over with one creator's nine fields. Always rendered so the slide transition can play. */
export function CreatorDrawer({ scored, canEdit, edit, onStartEdit, onEditDone, onClose }: Props) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = scored?.creator.id ?? null;

  useEffect(() => {
    if (!id) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    if (ref.current) ref.current.scrollTop = 0;
    return () => before?.focus?.({ preventScroll: true });
  }, [id]);

  const open = scored !== null;
  const c = scored?.creator;

  return (
    <>
      <div className={`cc-scrim${open ? ' cc-open' : ''}`} onClick={onClose} />
      <aside ref={ref} className={`cc-drawer scrollbar-thin${open ? ' cc-open' : ''}`} aria-hidden={!open} aria-label="Creator detail" tabIndex={-1} data-testid="drawer">
        {scored && c && (
          <>
            <div className="cc-dh">
              <div>
                <h2>{c.name}</h2>
                <div className="cc-hd">@{c.username}</div>
              </div>
              <button ref={closeRef} type="button" className="cc-xbtn" aria-label="Close" onClick={onClose}>
                <CloseIcon />
              </button>
            </div>
            <div className="cc-dmeta">
              <span className="cc-pl">{PLATFORM_LABEL[c.platform] ?? c.platform}</span>
              <span className="cc-pl">Tier: {c.tier}</span>
            </div>
            {edit ? (
              <CreatorEditForm key={`${c.id}:${edit}`} scored={scored} mode={edit} onDone={onEditDone} />
            ) : (
              <>
                <div className="cc-dsum">
                  <div className="cc-big" data-testid="drawer-missing-count">
                    {scored.missing.length}
                    <small>{scored.missing.length === 1 ? 'field missing' : 'fields missing'}</small>
                  </div>
                </div>
                {canEdit ? (
                  <div className="cc-actions">
                    {scored.missing.length > 0 && (
                      <button type="button" className="cc-btn cc-btn-primary" data-testid="fill-missing" onClick={() => onStartEdit('fill')}>
                        Fill missing details
                      </button>
                    )}
                    <button type="button" className="cc-btn" data-testid="edit-details" onClick={() => onStartEdit('edit')}>
                      Edit details
                    </button>
                  </div>
                ) : (
                  <p className="cc-view-only" data-testid="view-only">
                    View only. Your role can see creator details but not change them.
                  </p>
                )}
                <ul className="cc-fl">
                  {FIELDS.map((f) => (
                    <li key={f.key}>
                      <span className="cc-k">{f.label}</span>
                      <span className="cc-v">
                        {!scored.applicable.includes(f.key) ? (
                          <span className="cc-na">Not applicable for {PLATFORM_LABEL[c.platform] ?? c.platform}</span>
                        ) : isFieldMissing(f.key, c[f.key]) ? (
                          <span className="cc-tag">Missing</span>
                        ) : (
                          <Value c={c} k={f.key} />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="cc-dnote">Not checked: region{c.region?.trim() ? ` (${c.region})` : ' (empty)'}, tier, name, username and platform.</p>
          </>
        )}
      </aside>
    </>
  );
}
