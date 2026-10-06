import { describe, expect, it } from 'vitest';
import {
	addSource,
	applyEnrichment,
	countChanges,
	clearTitles,
	createDraft,
	removeTitles,
	restoreTitles,
} from '../src/components/editor/draft.ts';
import {
	enrichmentChunks,
	enrichmentCost,
	enrichmentQueue,
} from '../src/components/editor/enrichment.ts';
import type { CombinedList, SourceRecord, Title } from '../src/domain/types.ts';
import { sortTitles } from '../src/domain/sort.ts';
const title = (i: number, tmdbId: number | null = null): Title => ({
	imdbId: `tt${i}`,
	type: 'movie',
	name: `Title ${i}`,
	year: null,
	poster: null,
	blurb: null,
	tmdbId,
	addedSeq: i,
});
const saved: CombinedList = {
	id: 'test',
	name: 'Test',
	titles: [title(1)],
	removed: [title(2)],
	sources: [],
	sort: 'newest',
	nextSeq: 3,
	version: 1,
	updatedAt: '',
};
const source: SourceRecord = {
	url: 'https://trakt.tv/lists/1',
	site: 'trakt',
	titleCount: 4,
	skippedNoImdb: 0,
	addedAt: '2026-01-01T00:00:00Z',
};

describe('editor Draft', () => {
	it('clears all title history while retaining identity, settings and sequence, and accepts overlapping replacements', () => {
		const original = { ...saved, sources: [source], showOnHome: true };
		const draft = clearTitles(createDraft(original));
		expect(draft).toEqual({
			...original,
			titles: [],
			removed: [],
			sources: [],
			newIds: new Set(),
		});
		expect(countChanges(original, draft)).toBe(3);
		expect(original.titles).toHaveLength(1);
		expect(original.removed).toHaveLength(1);
		const replacement = addSource(draft, source, [
			title(1),
			title(2),
			title(3),
		]);
		expect(replacement.skipped).toBe(0);
		expect(replacement.draft.titles.map((t) => t.imdbId)).toEqual([
			'tt1',
			'tt2',
			'tt3',
		]);
		expect(replacement.draft.nextSeq).toBe(6);
		expect(countChanges(original, replacement.draft)).toBe(3);
		// Refilling with exactly the old active title must still enable Save.
		const same = addSource(draft, source, [title(1)]);
		expect(countChanges(original, same.draft)).toBe(2);
		expect(
			countChanges(
				{ ...saved, titles: [], removed: [], sources: [source] },
				draft
			)
		).toBe(1);
	});
	it('merges overlapping Sources and skips Removed Titles without changing saved state', () => {
		const first = addSource(createDraft(saved), source, [
			title(1),
			title(2),
			title(3),
			title(3),
		]);
		const second = addSource(
			first.draft,
			{ ...source, url: 'https://trakt.tv/lists/2' },
			[title(3), title(4)]
		);
		expect(second.draft.titles.map((t) => t.imdbId)).toEqual([
			'tt1',
			'tt3',
			'tt4',
		]);
		expect([...second.draft.newIds]).toEqual(['tt3', 'tt4']);
		expect(first.skipped).toBe(3);
		expect(countChanges(saved, second.draft)).toBe(4);
		expect(second.draft.nextSeq).toBe(5);
		expect(saved.titles).toHaveLength(1);
		const enriched = applyEnrichment(second.draft, [
			{ ...title(3), poster: 'https://image.tmdb.org/a.jpg', addedSeq: 99 },
		]);
		expect(enriched.titles[1]).toMatchObject({
			poster: 'https://image.tmdb.org/a.jpg',
			addedSeq: 3,
		});
		expect(countChanges(saved, enriched)).toBe(4);
		expect(createDraft({ ...enriched }).newIds.size).toBe(0);
	});
	it('removes and restores Titles, keeping order and counting only net changes', () => {
		const { draft } = addSource(createDraft(saved), source, [title(3)]);
		const removed = removeTitles(draft, ['tt1', 'tt3']);
		expect(removed.titles).toEqual([]);
		expect(removed.removed.map((t) => t.imdbId)).toEqual(['tt2', 'tt1', 'tt3']);
		// Source + new tt3 (now Removed) + tt1 removed.
		expect(countChanges(saved, removed)).toBe(3);
		// A removed new Title stays out when the same Source Titles arrive again.
		const again = addSource(removed, { ...source, url: 'x' }, [title(3)]);
		expect(again.draft.titles).toEqual([]);
		const restored = restoreTitles(removed, ['tt1', 'tt2']);
		expect(restored.titles.map((t) => [t.imdbId, t.addedSeq])).toEqual([
			['tt1', 1],
			['tt2', 2],
		]);
		// Year ties (here all null) keep the original order in Newest.
		expect(sortTitles(restored.titles, 'newest').map((t) => t.imdbId)).toEqual([
			'tt1',
			'tt2',
		]);
		// Source + tt3 Removed + tt2 restored; tt1 is back to its saved state.
		expect(countChanges(saved, restored)).toBe(3);
		expect(countChanges(saved, { ...createDraft(saved), sort: 'az' })).toBe(1);
		expect(removeTitles(draft, ['missing'])).toBe(draft);
		// Enrichment still lands on a Title removed while its chunk was in flight.
		const late = applyEnrichment(removed, [{ ...title(3), poster: 'p' }]);
		expect(late.removed[2].poster).toBe('p');
	});
	it('enriches 601 Titles within the request budget and globally limits simultaneous Sources to three requests', async () => {
		const titles = Array.from({ length: 601 }, (_, i) =>
			title(i, i % 2 ? i : null)
		);
		const chunks = enrichmentChunks(titles);
		expect(chunks.flat()).toEqual(titles);
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(40);
			expect(
				chunk.reduce((n, t) => n + enrichmentCost(t), 0)
			).toBeLessThanOrEqual(40);
		}
		const schedule = enrichmentQueue();
		let active = 0,
			max = 0;
		const seen: string[] = [];
		const run = async (chunk: Title[]) => {
			active += 1;
			max = Math.max(max, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			seen.push(...chunk.map((t) => t.imdbId));
			active -= 1;
		};
		await Promise.all([
			schedule(titles.slice(0, 301), run),
			schedule(titles.slice(301), run),
		]);
		expect(max).toBe(3);
		expect(seen.sort()).toEqual(titles.map((t) => t.imdbId).sort());
	});
	it('continues other enrichment chunks after a request fails', async () => {
		const schedule = enrichmentQueue();
		let completed = 0;
		await schedule(
			Array.from({ length: 101 }, (_, i) => title(i)),
			async (chunk) => {
				completed += chunk.length;
				if (chunk[0].imdbId === 'tt0') throw new Error('failed');
			}
		).catch(() => {});
		// Resolve a sentinel queued after all failed-source chunks.
		await schedule([title(200)], async () => {});
		expect(completed).toBe(101);
	});
});
