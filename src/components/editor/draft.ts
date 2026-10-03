import { mergeTitles } from '../../domain/merge.ts';
import type {
	CombinedList,
	SourceRecord,
	SourceTitle,
	Title,
} from '../../domain/types.ts';

export type Draft = CombinedList & { newIds: Set<string>; changes: number };
export const createDraft = (list: CombinedList): Draft => ({
	...list,
	newIds: new Set(),
	changes: 0,
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
			changes: draft.changes + merge.newTitles.length + 1,
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
	return {
		...draft,
		titles: draft.titles.map((title) => {
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
		}),
	};
}
