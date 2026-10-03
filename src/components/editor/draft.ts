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
		titles: [...draft.titles, ...moved],
		removed: draft.removed.filter((title) => !set.has(title.imdbId)),
	};
}
/**
 * Counts the Draft against the saved list rather than tallying actions, so a
 * remove followed by a restore (or a sort switched back) is not a change.
 * Each added Source, each Title whose state differs and a sort change count once.
 */
export function countChanges(saved: CombinedList, draft: Draft): number {
	const state = new Map<string, 'active' | 'removed'>();
	for (const title of saved.titles) state.set(title.imdbId, 'active');
	for (const title of saved.removed) state.set(title.imdbId, 'removed');
	let changes = Math.max(0, draft.sources.length - saved.sources.length);
	if (draft.sort !== saved.sort) changes += 1;
	for (const title of draft.titles)
		if (state.get(title.imdbId) !== 'active') changes += 1;
	for (const title of draft.removed)
		if (state.get(title.imdbId) !== 'removed') changes += 1;
	return changes;
}
