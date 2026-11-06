/**
 * Lists: reads and writes. Every write refreshes what it can have changed — the
 * lists themselves, the creator rows ("In 2 lists"), and any analytics scoped to a
 * list — so no screen shows a stale count after an add or remove.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { listsApi } from '@/lib/endpoints';
import type { ListCreateRequest, ListMemberUpdate, ListSharingUpdate, ListStatus, ListUpdateRequest } from '@/types/api';

export const listKeys = {
  all: ['lists'] as const,
  index: ['lists', 'index'] as const,
  one: (id: string) => ['lists', 'one', id] as const,
  forCreator: (creatorId: string) => ['lists', 'creator', creatorId] as const,
  people: ['people'] as const,
};

/** NEW: colleagues for the Share dialog. Rarely changes, so cached for a while. */
export function usePeople(enabled = true) {
  return useQuery({
    queryKey: listKeys.people,
    queryFn: ({ signal }) => listsApi.people({ signal }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** NEW: health score → words and colour, for the cards. */
export function healthMeta(score: number | null) {
  if (score == null) return { label: 'Empty', tone: 'text-rp-muted' };
  if (score >= 80) return { label: 'Healthy', tone: 'text-rp-success' };
  if (score >= 60) return { label: 'Fair', tone: 'text-rp-warn' };
  return { label: 'Needs work', tone: 'text-rp-danger' };
}

export const STATUS_META: Record<ListStatus, { label: string; tone: string; dot: string }> = {
  shortlisted: { label: 'Shortlisted', tone: 'text-rp-muted bg-rp-surface2', dot: 'bg-rp-muted' },
  contacted: { label: 'Contacted', tone: 'text-rp-primary bg-rp-primary-soft', dot: 'bg-rp-primary' },
  confirmed: { label: 'Confirmed', tone: 'text-rp-success bg-[color-mix(in_oklch,var(--rp-success)_14%,transparent)]', dot: 'bg-rp-success' },
  rejected: { label: 'Rejected', tone: 'text-rp-danger bg-[color-mix(in_oklch,var(--rp-danger)_13%,transparent)]', dot: 'bg-rp-danger' },
};
export const STATUSES: ListStatus[] = ['shortlisted', 'contacted', 'confirmed', 'rejected'];

export function refreshAfterListChange(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: listKeys.all }),
    // "In N lists" on rows, list-scoped searches, and list-scoped analytics.
    qc.invalidateQueries({ queryKey: ['search'] }),
    qc.invalidateQueries({ queryKey: ['analytics'] }),
  ]);
}

export function useLists() {
  return useQuery({
    queryKey: listKeys.index,
    queryFn: ({ signal }) => listsApi.all({ signal }),
    staleTime: 15_000,
  });
}

export function useList(id: string | null | undefined) {
  return useQuery({
    queryKey: listKeys.one(id ?? ''),
    queryFn: ({ signal }) => listsApi.get(id!, { signal }),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreatorLists(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: listKeys.forCreator(creatorId ?? ''),
    queryFn: ({ signal }) => listsApi.forCreator(creatorId!, { signal }),
    enabled: Boolean(creatorId),
  });
}

export function useListActions() {
  const qc = useQueryClient();
  const done = () => refreshAfterListChange(qc);

  const create = useMutation({ mutationFn: (body: ListCreateRequest) => listsApi.create(body), onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ListUpdateRequest }) => listsApi.update(id, body),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => listsApi.remove(id), onSuccess: done });
  const share = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ListSharingUpdate }) => listsApi.share(id, body),
    onSuccess: done,
  });
  const duplicate = useMutation({ mutationFn: (id: string) => listsApi.duplicate(id), onSuccess: done });
  const add = useMutation({
    mutationFn: ({ id, creatorIds }: { id: string; creatorIds: string[] }) => listsApi.addCreators(id, creatorIds),
    onSuccess: done,
  });
  const removeCreators = useMutation({
    mutationFn: ({ id, creatorIds }: { id: string; creatorIds: string[] }) => listsApi.removeCreators(id, creatorIds),
    onSuccess: done,
  });
  const updateMember = useMutation({
    mutationFn: ({ id, creatorId, body }: { id: string; creatorId: string; body: ListMemberUpdate }) =>
      listsApi.updateMember(id, creatorId, body),
    onSuccess: (_, v) => Promise.all([qc.invalidateQueries({ queryKey: listKeys.one(v.id) }), qc.invalidateQueries({ queryKey: listKeys.forCreator(v.creatorId) }), ...(v.body.status ? [qc.invalidateQueries({ queryKey: ['search'] })] : [])]),
  });

  /** Copy = add to the target. Move = add to the target, then take out of the source. */
  const transfer = async (fromId: string, toId: string, creatorIds: string[], mode: 'move' | 'copy') => {
    const res = await listsApi.addCreators(toId, creatorIds);
    if (mode === 'move') await listsApi.removeCreators(fromId, creatorIds);
    await done();
    return res;
  };

  return { create, update, remove, share, duplicate, add, removeCreators, updateMember, transfer };
}

/** "Added 3 to Fitness Q4 · 1 was already there" */
export function addedMessage(listName: string, added: number, skipped: number) {
  const a = added === 0 ? 'Nobody new added to' : `Added ${added} ${added === 1 ? 'creator' : 'creators'} to`;
  const s = skipped ? ` · ${skipped} ${skipped === 1 ? 'was' : 'were'} already there` : '';
  return `${a} ${listName}${s}`;
}
