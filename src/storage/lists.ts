import type { CombinedList, TitleType } from '../domain/types.ts';

export type ListIndexEntry = {
	id: string;
	name: string;
	count: number;
	types: TitleType[];
};

export type ListStore = Pick<KVNamespace, 'get' | 'put' | 'delete'>;

export class VersionConflictError extends Error {
	readonly status = 409;
	constructor() {
		super('The Combined List changed. Reload before saving.');
		this.name = 'VersionConflictError';
	}
}

export async function getList(
	kv: ListStore,
	id: string
): Promise<CombinedList | null> {
	return kv.get<CombinedList>(`list:${id}`, 'json');
}

export async function getIndex(kv: ListStore): Promise<ListIndexEntry[]> {
	return (await kv.get<ListIndexEntry[]>('index', 'json')) ?? [];
}

export function indexEntry(list: CombinedList): ListIndexEntry {
	return {
		id: list.id,
		name: list.name,
		count: list.titles.length,
		types: (['movie', 'series'] as const).filter((type) =>
			list.titles.some((title) => title.type === type)
		),
	};
}

/** Version 0 creates a list; subsequent saves submit the last saved version.
 * KV is eventually consistent and has no atomic compare-and-swap: this detects
 * observed stale drafts, but cannot serialize simultaneous writers.
 */
export async function putList(
	kv: ListStore,
	draft: CombinedList
): Promise<CombinedList> {
	const current = await getList(kv, draft.id);
	if (draft.version !== (current?.version ?? 0))
		throw new VersionConflictError();
	const saved = {
		...draft,
		version: draft.version + 1,
		updatedAt: new Date().toISOString(),
	};
	const index = await getIndex(kv);
	const entry = indexEntry(saved);
	const position = index.findIndex((item) => item.id === saved.id);
	if (position === -1) index.push(entry);
	else index[position] = entry;
	await kv.put(`list:${saved.id}`, JSON.stringify(saved));
	await kv.put('index', JSON.stringify(index));
	return saved;
}

export async function deleteList(kv: ListStore, id: string): Promise<void> {
	const index = await getIndex(kv);
	await kv.delete(`list:${id}`);
	await kv.put('index', JSON.stringify(index.filter((item) => item.id !== id)));
}
