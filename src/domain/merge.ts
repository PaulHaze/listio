import type { CombinedList, SourceTitle, Title } from './types.ts';

export type MergeInput = SourceTitle | Omit<Title, 'addedSeq'>;

export type MergeResult = {
	/** Existing titles followed by the newly accepted titles. */
	titles: Title[];
	/** Titles accepted from this Source, in first-seen order. */
	newTitles: Title[];
	/** Convenient identity set for the editor's “Show only new” filter. */
	newIds: string[];
	nextSeq: number;
	skippedExisting: number;
	skippedRemoved: number;
	skippedDuplicate: number;
	skippedNoImdb: number;
};

function hasText(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function titleFromInput(input: MergeInput, addedSeq: number): Title {
	return {
		imdbId: input.imdbId.trim().toLowerCase(),
		type: input.type,
		name: input.name.trim(),
		year: input.year,
		poster: 'poster' in input ? input.poster : null,
		blurb: 'blurb' in input ? input.blurb : null,
		rating: 'rating' in input ? (input.rating ?? null) : null,
		tmdbId: input.tmdbId,
		addedSeq,
	};
}

/**
 * Removed Titles keep their `addedSeq` so a restore returns them to their
 * original position; they must count here or a new Title could reuse it.
 */
function deriveNextSeq(
	list: Pick<CombinedList, 'titles' | 'removed' | 'nextSeq'>
): number {
	const highest = [...list.titles, ...list.removed].reduce(
		(max, title) => Math.max(max, title.addedSeq),
		-1
	);
	return Math.max(list.nextSeq ?? 0, highest + 1);
}

/**
 * Merge normalized Source Titles into a Combined List draft.
 *
 * IMDb identity is checked against both active and Removed Titles. Repeated
 * IMDb IDs within the incoming Source are accepted once, and every accepted
 * Title receives the next monotonic `addedSeq` value.
 */
export function mergeTitles(
	list: Pick<CombinedList, 'titles' | 'removed' | 'nextSeq'>,
	incoming: readonly MergeInput[]
): MergeResult {
	const existingIds = new Set(
		list.titles.map((title) => title.imdbId.toLowerCase())
	);
	const removedIds = new Set(
		list.removed.map((title) => title.imdbId.toLowerCase())
	);
	const seenIncoming = new Set<string>();
	const newTitles: Title[] = [];
	let nextSeq = deriveNextSeq(list);
	let skippedExisting = 0;
	let skippedRemoved = 0;
	let skippedDuplicate = 0;
	let skippedNoImdb = 0;

	for (const item of incoming) {
		if (!hasText(item.imdbId)) {
			skippedNoImdb += 1;
			continue;
		}

		const imdbId = item.imdbId.trim().toLowerCase();
		if (seenIncoming.has(imdbId)) {
			skippedDuplicate += 1;
			continue;
		}
		seenIncoming.add(imdbId);
		if (removedIds.has(imdbId)) {
			skippedRemoved += 1;
			continue;
		}
		if (existingIds.has(imdbId)) {
			skippedExisting += 1;
			continue;
		}

		const title = titleFromInput(item, nextSeq);
		existingIds.add(imdbId);
		newTitles.push(title);
		nextSeq += 1;
	}

	return {
		titles: [...list.titles, ...newTitles],
		newTitles,
		newIds: newTitles.map((title) => title.imdbId),
		nextSeq,
		skippedExisting,
		skippedRemoved,
		skippedDuplicate,
		skippedNoImdb,
	};
}

/** Apply a merge result to a list-shaped draft in one pure operation. */
export function mergeIntoList(
	list: CombinedList,
	incoming: readonly MergeInput[]
): CombinedList & { newTitles: Title[]; newIds: string[] } {
	const result = mergeTitles(list, incoming);
	return {
		...list,
		titles: result.titles,
		nextSeq: result.nextSeq,
		newTitles: result.newTitles,
		newIds: result.newIds,
	};
}

/** Explicit addition overrides removal; duplicate additions leave the Draft untouched. */
export function addTitle<T extends CombinedList & { newIds: Set<string> }>(
	draft: T,
	input: Title
): { draft: T; status: 'added' | 'duplicate' | 'restored' } {
	const id = input.imdbId.trim().toLowerCase();
	if (draft.titles.some((t) => t.imdbId.toLowerCase() === id))
		return { draft, status: 'duplicate' };
	const removed = draft.removed.find((t) => t.imdbId.toLowerCase() === id);
	const title = removed ?? titleFromInput(input, deriveNextSeq(draft));
	return {
		status: removed ? 'restored' : 'added',
		draft: {
			...draft,
			titles: [...draft.titles, title].sort((a, b) => a.addedSeq - b.addedSeq),
			removed: draft.removed.filter((t) => t.imdbId.toLowerCase() !== id),
			nextSeq: removed ? draft.nextSeq : title.addedSeq + 1,
			newIds: new Set([...draft.newIds, id]),
		},
	};
}
