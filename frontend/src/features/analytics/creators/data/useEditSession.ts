import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { creatorEditApi } from '@/lib/endpoints';
import type { EditRecord } from '@/types/api';

type Session =
  | { status: 'opening' }
  | { status: 'ready'; record: EditRecord }
  | { status: 'blocked'; message: string };

/** The backend keeps a lock for 2 minutes; renew it every minute while the form stays open. */
const RENEW_MS = 60_000;

/**
 * Opens the edit form on the server: claims the lock (so two people cannot edit the same creator) and
 * returns the row with its version. The lock is renewed while the form is open and released when it closes.
 * A forgotten lock clears itself, so a failed release is harmless.
 */
export function useEditSession(creatorId: string) {
  const [session, setSession] = useState<Session>({ status: 'opening' });
  const held = useRef(false);

  useEffect(() => {
    let alive = true;
    setSession({ status: 'opening' });
    held.current = false;

    creatorEditApi.open(creatorId).then(
      (s) => {
        if (!alive) {
          void creatorEditApi.close(creatorId).catch(() => undefined);
          return;
        }
        held.current = true;
        setSession({ status: 'ready', record: s.record });
      },
      (e: unknown) => {
        if (!alive) return;
        const message =
          e instanceof ApiError
            ? e.status === 403
              ? 'You do not have permission to edit creators.'
              : e.detail
            : 'Could not open the edit form.';
        setSession({ status: 'blocked', message });
      },
    );

    const timer = setInterval(() => {
      if (held.current) void creatorEditApi.open(creatorId).catch(() => undefined);
    }, RENEW_MS);

    return () => {
      alive = false;
      clearInterval(timer);
      if (held.current) void creatorEditApi.close(creatorId).catch(() => undefined);
    };
  }, [creatorId]);

  return session;
}
