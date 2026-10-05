import type { CombinedList, TitleType } from '../domain/types.ts';

export type ListIndexEntry = {
	creationId?: string;
	id: string;
	name: string;
	count: number;
	types: TitleType[];
	showOnHome?: boolean;
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
	return (
		(await kv.get<CombinedList>(`list:${id}`, 'json')) ??
		(await kv.get<CombinedList>(`initial:${id}`, 'json'))
	);
}

export async function getIndex(kv: ListStore): Promise<ListIndexEntry[]> {
	return (await kv.get<ListIndexEntry[]>('index', 'json')) ?? [];
}

export function indexEntry(list: CombinedList): ListIndexEntry {
	return {
		...(list.creationId ? { creationId: list.creationId } : {}),
		id: list.id,
		name: list.name,
		count: list.titles.length,
		types: (['movie', 'series'] as const).filter((type) =>
			list.titles.some((title) => title.type === type)
		),
		...(list.showOnHome ? { showOnHome: true } : {}),
	};
}

/** Version 0 creates a list; subsequent saves submit the last saved version.
 * KV is eventually consistent and has no atomic compare-and-swap: this detects
 * observed stale drafts, but cannot serialize simultaneous writers.
 * The index is written first: an index entry without its list degrades to an
 * empty Catalog and is repaired by retrying, whereas an unindexed list would be
 * invisible and block a version-0 retry.
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
	await kv.put('index', JSON.stringify(index));
	await kv.put(`list:${saved.id}`, JSON.stringify(saved));
	return saved;
}

export async function deleteList(kv: ListStore, id: string): Promise<void> {
	const index = await getIndex(kv);
	await kv.delete(`initial:${id}`);
	await kv.delete(`list:${id}`);
	await kv.put('index', JSON.stringify(index.filter((item) => item.id !== id)));
}

/** Creation retries write only an initial snapshot, never the mutable saved list.
 * This keeps a delayed/missing KV read from turning a retry into a destructive
 * version-0 overwrite. UUID identities bind recovery to this import, not a name.
 * Like all index updates, this is not a transaction across concurrent writers.
 */
export async function createImportList(
	kv: ListStore,
	name: string,
	creationId: string
): Promise<CombinedList> {
	const id = `import-${creationId}`;
	const index = await getIndex(kv);
	const current = await getList(kv, id);
	const reservation = index.find((entry) => entry.id === id);
	if (
		(current && current.creationId !== creationId) ||
		(reservation && reservation.creationId !== creationId)
	)
		throw new VersionConflictError();
	// Replaying an existing operation preserves renames and all saved Titles.
	if (current) return current;
	if (reservation && reservation.name !== name)
		throw new VersionConflictError();
	if (
		!reservation &&
		index.some(
			(entry) => entry.name.trim().toLowerCase() === name.toLowerCase()
		)
	)
		throw new ImportNameConflictError(name);
	const initial: CombinedList = {
		id,
		creationId,
		name,
		sort: 'newest',
		sources: [],
		titles: [],
		removed: [],
		nextSeq: 0,
		version: 1,
		updatedAt: new Date().toISOString(),
	};
	if (!reservation) {
		index.push(indexEntry(initial));
		await kv.put('index', JSON.stringify(index));
	}
	await kv.put(`initial:${id}`, JSON.stringify(initial));
	return initial;
}
export class ImportNameConflictError extends VersionConflictError {
	constructor(name: string) {
		super();
		this.message = `A list named "${name}" already exists. Choose another name.`;
	}
}
