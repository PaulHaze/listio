import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportListRun } from '../src/client/importList.ts';
import { pasteLines } from '../src/domain/pasteLines.ts';
import type { CombinedList, Title } from '../src/domain/types.ts';
const title = (id: number): Title => ({
	imdbId: `tt${id}`,
	type: 'movie',
	name: `Title ${id}`,
	year: 2000,
	tmdbId: id,
	poster: null,
	blurb: null,
	addedSeq: 0,
});
const empty: CombinedList = {
	id: 'test',
	name: 'Test',
	titles: [],
	removed: [],
	sources: [],
	nextSeq: 0,
	version: 1,
	sort: 'newest',
	updatedAt: '',
};
const response = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), { status });
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe('resumable single-list import', () => {
	it('matches before creating, persists deduplicated Titles and blocks repeated submits', async () => {
		let resolve!: (value: Response) => void;
		let saved = empty;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith('/match'))
				return new Promise<Response>((done) => (resolve = done));
			if (init.method === 'GET') return response([]);
			if (init.method === 'POST') return response(empty);
			saved = { ...empty, ...JSON.parse(init.body as string), version: 2 };
			return response(saved);
		});
		vi.stubGlobal('fetch', fetcher);
		const run = new ImportListRun(' Test ', pasteLines('One\nTwo\nAlias'));
		const pending = run.continue(signal());
		await run.continue(signal());
		expect(fetcher).toHaveBeenCalledTimes(1);
		resolve(
			response(
				[title(1), title(2), title(1)].map((title) => ({
					status: 'matched',
					title,
				}))
			)
		);
		await pending;
		expect(
			fetcher.mock.calls.map(([url, init]) => `${init.method} ${url}`)
		).toEqual([
			'POST /api/titles/match',
			'GET /api/lists',
			'POST /api/lists',
			'PUT /api/lists/test',
		]);
		expect(saved.titles.map((title) => [title.imdbId, title.addedSeq])).toEqual(
			[
				['tt1', 0],
				['tt2', 1],
			]
		);
		expect(run.state.phase).toBe('completed');
		expect(run.state.duplicates).toBe(1);
		await run.continue(signal());
		expect(fetcher).toHaveBeenCalledTimes(4);
	});
	it('stops a failed matching request before creation and resumes only unfinished lines', async () => {
		const batches: string[][] = [];
		let failed = false;
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			if (url.endsWith('/match')) {
				const lines = JSON.parse(init.body as string).lines;
				batches.push(lines.map((line: { name: string }) => line.name));
				if (batches.length === 2 && !failed) {
					failed = true;
					throw new Error('Offline');
				}
				return response(
					lines.map((line: { name: string }) => ({
						status: 'matched',
						title: title(Number(line.name)),
					}))
				);
			}
			if (init.method === 'GET') return response([]);
			return response(
				init.method === 'POST'
					? empty
					: { ...empty, ...JSON.parse(init.body as string), version: 2 }
			);
		});
		const run = new ImportListRun(
			'Test',
			pasteLines(Array.from({ length: 25 }, (_, i) => String(i + 1)).join('\n'))
		);
		await run.continue(signal());
		expect(run.state.phase).toBe('stopped');
		expect(run.state.list).toBeNull();
		expect(run.state.matches).toHaveLength(20);
		await run.continue(signal());
		expect(batches.map((batch) => batch.length)).toEqual([20, 5, 5]);
		expect(run.state.list?.titles).toHaveLength(25);
	});
	it('retains the created ID after failed save and retries without matching or creating', async () => {
		let fail = true;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith('/match'))
				return response([{ status: 'matched', title: title(1) }]);
			if (url === '/api/lists' && init.method === 'GET') return response([]);
			if (init.method === 'POST' || init.method === 'GET')
				return response(empty);
			if (fail) {
				fail = false;
				throw new Error('Save offline');
			}
			return response({
				...empty,
				...JSON.parse(init.body as string),
				version: 2,
			});
		});
		vi.stubGlobal('fetch', fetcher);
		const run = new ImportListRun('Test', pasteLines('One'));
		await run.continue(signal());
		expect(run.state.list?.id).toBe('test');
		expect(run.state.progress).toContain('pending');
		await run.continue(signal());
		expect(
			fetcher.mock.calls.filter(([, init]) => init.method === 'POST')
		).toHaveLength(2);
		expect(run.state.list?.titles).toHaveLength(1);
	});
	it('reconciles a successful save whose response was lost and preserves later picks against stale reads', async () => {
		let saved = empty;
		let loseResponse = true;
		let stale = false;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith('/match'))
				return response([{ status: 'matched', title: title(1) }]);
			if (url === '/api/lists' && init.method === 'GET') return response([]);
			if (init.method === 'POST') return response(empty);
			if (init.method === 'GET') return response(stale ? empty : saved);
			const draft = JSON.parse(init.body as string);
			expect(draft.version).toBe(saved.version);
			saved = { ...saved, ...draft, version: saved.version + 1 };
			if (loseResponse) {
				loseResponse = false;
				throw new Error('Lost save response');
			}
			return response(saved);
		});
		vi.stubGlobal('fetch', fetcher);
		const run = new ImportListRun('Test', pasteLines('One'));
		await run.continue(signal());
		expect(run.state.phase).toBe('stopped');
		await run.continue(signal());
		expect(run.state.list?.titles).toHaveLength(1);
		stale = true;
		await run.add(title(2), signal());
		await run.add(title(3), signal());
		expect(run.state.list?.titles.map((title) => title.imdbId)).toEqual([
			'tt1',
			'tt2',
			'tt3',
		]);
		expect(
			fetcher.mock.calls.filter(([, init]) => init.method === 'POST')
		).toHaveLength(2);
	});

	it('reconciles an uncertain create and never repeats POST while the outcome is unknown', async () => {
		let visible = false;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith('/match'))
				return response([{ status: 'matched', title: title(1) }]);
			if (url === '/api/lists' && init.method === 'GET')
				return response(visible ? [{ id: 'test', name: 'Test' }] : []);
			if (init.method === 'POST') throw new Error('Lost create response');
			if (init.method === 'GET') return response(empty);
			return response({
				...empty,
				...JSON.parse(init.body as string),
				version: 2,
			});
		});
		vi.stubGlobal('fetch', fetcher);
		const run = new ImportListRun('Test', pasteLines('One'));
		await run.continue(signal());
		await run.continue(signal());
		expect(run.state.error).toContain('outcome is still unknown');
		visible = true;
		await run.continue(signal());
		expect(run.state.phase).toBe('completed');
		expect(
			fetcher.mock.calls.filter(
				([url, init]) => url === '/api/lists' && init.method === 'POST'
			)
		).toHaveLength(1);
	});
	it('rechecks names before creation and directs an existing list to its editor', async () => {
		const fetcher = vi.fn(async (url: string) =>
			response(
				url.endsWith('/match')
					? [{ status: 'matched', title: title(1) }]
					: [{ id: 'old', name: ' test ' }]
			)
		);
		vi.stubGlobal('fetch', fetcher);
		const run = new ImportListRun('Test', pasteLines('One'));
		await run.continue(signal());
		expect(run.state.error).toContain('already exists');
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('creates no list if every line needs a look, with known issues or a format hint', async () => {
		for (const result of [
			{ status: 'none', reason: 'No match' },
			{ status: 'none', reason: 'TMDB unavailable', retry: true },
			{ status: 'ambiguous', candidates: [] },
		]) {
			const fetcher = vi.fn(async (_url: string) => response([result]));
			vi.stubGlobal('fetch', fetcher);
			const run = new ImportListRun('Test', pasteLines('Unknown'));
			await run.continue(signal());
			expect(run.state.phase).toBe('empty');
			expect(run.state.list).toBeNull();
			expect(run.state.error).toContain('Check the list format');
			if (result.reason === 'TMDB unavailable')
				expect(run.state.error).toContain('TMDB unavailable');
			expect(
				fetcher.mock.calls.every(([url]) => url === '/api/titles/match')
			).toBe(true);
		}
	});
});
