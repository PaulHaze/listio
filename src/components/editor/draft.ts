import { mergeTitles } from '../../domain/merge.ts';
import type {
	CombinedList,
	SourceRecord,
	SourceTitle,
	Title,
} from '../../domain/types.ts';

export type Draft = CombinedList & { newIds: Set<string> };
export const createDraft = (list: CombinedList): Draft => ({
	...list,
	newIds: new Set(),
});
/** Start fresh without changing the list identity or its monotonic sequence. */
export function clearTitles(draft: Draft): Draft {
	return {
		...draft,
		titles: [],
		removed: [],
		sources: [],
		newIds: new Set(),
	};
}
export function addSource(
	draft: Draft,
	source: SourceRecord,
	titles: SourceTitle[]
) {
	const merge = mergeTitles(draft, titles);
	return {
		draft: {
			...draft,
			titles: merge.titles,
			nextSeq: merge.nextSeq,
			sources: [...draft.sources, source],
			newIds: new Set([...draft.newIds, ...merge.newIds]),
		},
		newTitles: merge.newTitles,
		skipped:
			merge.skippedExisting +
			merge.skippedRemoved +
			merge.skippedDuplicate +
			merge.skippedNoImdb,
	};
}
export function applyEnrichment(draft: Draft, titles: Title[]): Draft {
	const byId = new Map(titles.map((title) => [title.imdbId, title]));
	const enrich = (title: Title) => {
		const enriched = byId.get(title.imdbId);
		// Metadata cannot change identity, type or the monotonic ordering.
		return enriched
			? {
					...title,
					poster: enriched.poster,
					blurb: enriched.blurb,
					rating: enriched.rating ?? null,
					year: enriched.year,
					tmdbId: enriched.tmdbId,
				}
			: title;
	};
	// A Title can be removed while its enrichment chunk is still in flight.
	return {
		...draft,
		titles: draft.titles.map(enrich),
		removed: draft.removed.map(enrich),
	};
}
/** Moves Titles into Removed; they keep `addedSeq` so a restore returns them in place. */
export function removeTitles(draft: Draft, ids: Iterable<string>): Draft {
	const set = new Set(ids);
	const moved = draft.titles.filter((title) => set.has(title.imdbId));
	if (!moved.length) return draft;
	return {
		...draft,
		titles: draft.titles.filter((title) => !set.has(title.imdbId)),
		removed: [...draft.removed, ...moved],
	};
}
export function restoreTitles(draft: Draft, ids: Iterable<string>): Draft {
	const set = new Set(ids);
	const moved = draft.removed.filter((title) => set.has(title.imdbId));
	if (!moved.length) return draft;
	return {
		...draft,
		// Sorts break ties by array index, so keep `titles` in `addedSeq` order.
		titles: [...draft.titles, ...moved].sort((a, b) => a.addedSeq - b.addedSeq),
		removed: draft.removed.filter((title) => !set.has(title.imdbId)),
	};
}
/**
 * Counts the Draft against the saved list rather than tallying actions, so a
 * remove followed by a restore (or a sort switched back) is not a change.
 * Each added/deleted Source, each Title whose state or order differs and a sort
 * change count once. Titles deleted by clearing the list count too.
 */
export function countChanges(saved: CombinedList, draft: Draft): number {
	const state = new Map<string, 'active' | 'removed'>();
	for (const title of saved.titles) state.set(title.imdbId, 'active');
	for (const title of saved.removed) state.set(title.imdbId, 'removed');
	const savedSources = new Set(saved.sources.map((source) => source.url));
	const draftSources = new Set(draft.sources.map((source) => source.url));
	let changes = [...savedSources].filter(
		(url) => !draftSources.has(url)
	).length;
	changes += [...draftSources].filter((url) => !savedSources.has(url)).length;
	if (draft.sort !== saved.sort) changes += 1;
	const sequences = new Map(
		[...saved.titles, ...saved.removed].map((title) => [
			title.imdbId,
			title.addedSeq,
		])
	);
	const present = new Set<string>();
	for (const title of draft.titles) {
		present.add(title.imdbId);
		if (
			state.get(title.imdbId) !== 'active' ||
			sequences.get(title.imdbId) !== title.addedSeq
		)
			changes += 1;
	}
	for (const title of draft.removed) {
		present.add(title.imdbId);
		if (
			state.get(title.imdbId) !== 'removed' ||
			sequences.get(title.imdbId) !== title.addedSeq
		)
			changes += 1;
	}
	for (const id of state.keys()) if (!present.has(id)) changes += 1;
	return changes;
}
