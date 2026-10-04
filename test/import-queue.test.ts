import { afterEach, expect, it, vi } from 'vitest';
import { ImportQueue } from '../src/client/importQueue.ts';
import { parseImport } from '../src/domain/pasteSections.ts';
import type { CombinedList, Title } from '../src/domain/types.ts';
const title = (id: number): Title => ({
	imdbId: `tt${id}`,
	tmdbId: id,
	type: 'movie',
	name: `Title ${id}`,
	year: 2000,
	poster: null,
	blurb: null,
	addedSeq: 0,
});
const response = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
function setup(failure: 'match' | 'save' | 'empty' | null = null) {
	const saved = new Map<string, CombinedList>();
	const events: string[] = [];
	let failed = false;
	let matches = 0;
	let failPick = false;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match')) {
			matches++;
			events.push(`match ${matches}`);
			if (matches === 2 && !failed && failure) {
				if (failure === 'match') {
					failed = true;
					throw new Error('Offline');
				}
				if (failure === 'empty') {
					failed = true;
					return response([
						{ status: 'none', reason: 'No match' },
						{ status: 'none', reason: 'No match' },
					]);
				}
			}
			return response([
				{ status: 'matched', title: title(1) },
				{ status: 'ambiguous', candidates: [title(2)] },
			]);
		}
		if (url === '/api/lists' && init.method === 'GET')
			return response([...saved.values()]);
		if (init.method === 'POST') {
			const name = JSON.parse(init.body as string).name;
			events.push(`create ${name}`);
			const list: CombinedList = {
				id: name,
				name,
				titles: [],
				removed: [],
				sources: [],
				nextSeq: 0,
				version: 1,
				sort: 'newest',
				updatedAt: '',
			};
			saved.set(name, list);
			return response(list);
		}
		const id = decodeURIComponent(url.split('/').at(-1)!);
		if (init.method === 'GET') return response(saved.get(id));
		events.push(`save ${id}`);
		if (failure === 'save' && id === 'B' && !failed) {
			failed = true;
			throw new Error('Save offline');
		}
		if (failPick) {
			failPick = false;
			throw new Error('Pick offline');
		}
		const list = {
			...saved.get(id)!,
			...JSON.parse(init.body as string),
			version: saved.get(id)!.version + 1,
		};
		saved.set(id, list);
		return response(list);
	});
	const parsed = parseImport(
		'## A\nSame\nReview\n## Skip\nSame\nReview\n## B\nSame\nReview\n## C\nSame\nReview',
		'multiple'
	);
	const queue = new ImportQueue(
		parsed.sections.map((section) => ({
			...section,
			selected: section.name !== 'Skip',
		}))
	);
	return {
		queue,
		saved,
		events,
		failNextPick: () => {
			failPick = true;
		},
	};
}
it('snapshots checked names and titles and saves each section in file order', async () => {
	const { queue, saved, events } = setup();
	const pending = queue.continue(signal());
	await queue.continue(signal());
	await pending;
	expect(events).toEqual([
		'match 1',
		'create A',
		'save A',
		'match 2',
		'create B',
		'save B',
		'match 3',
		'create C',
		'save C',
	]);
	expect([...saved.keys()]).toEqual(['A', 'B', 'C']);
	expect(queue.progress).toBe('Import complete.');
	expect(
		[...saved.values()].every((list) => list.titles[0].imdbId === 'tt1')
	).toBe(true);
});
it.each(['match', 'save', 'empty'] as const)(
	'retains completed review after %s failure and continues first unfinished section',
	async (failure) => {
		const { queue, saved, events } = setup(failure);
		await queue.continue(signal());
		expect(queue.entries[0].run.state.phase).toBe('completed');
		expect(queue.entries[0].run.unresolvedText()).toBe('Review');
		expect(queue.entries[2].run.state.phase).toBe('idle');
		expect(queue.unfinished?.run.name).toBe('B');
		const createsBefore = events.filter((event) => event.startsWith('create'));
		await queue.continue(signal());
		expect(
			queue.entries.every((entry) => entry.run.state.phase === 'completed')
		).toBe(true);
		expect(events.filter((event) => event === 'create A')).toHaveLength(1);
		expect(events.filter((event) => event === 'create B')).toHaveLength(1);
		if (failure === 'save') {
			expect(createsBefore).toEqual(['create A', 'create B']);
			expect(events.slice(events.indexOf('save B') + 1)).toEqual([
				'save B',
				'match 3',
				'create C',
				'save C',
			]);
		}
		expect([...saved.keys()]).toEqual(['A', 'B', 'C']);
		expect(queue.entries[0].run.unresolvedText()).toBe('Review');
	}
);
it('same Title picks save independently, failed picks remain unresolved and copy state stays scoped', async () => {
	const { queue, saved, failNextPick } = setup('match');
	await queue.continue(signal());
	const first = queue.entries[0].run;
	const row = first.state.review[0];
	failNextPick();
	await expect(first.add(title(2), signal())).rejects.toThrow('Pick offline');
	expect(first.unresolvedText()).toBe('Review');
	await first.add(title(2), signal());
	first.resolve(row);
	await queue.continue(signal());
	const second = queue.entries[1].run;
	expect(second.unresolvedText()).toBe('Review');
	await second.add(title(2), signal());
	second.resolve(second.state.review[0]);
	expect(first.unresolvedText()).toBe('');
	expect(second.unresolvedText()).toBe('');
	expect(queue.entries[2].run.unresolvedText()).toBe('Review');
	expect(saved.get('A')!.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
	]);
	expect(saved.get('B')!.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
	]);
	expect(saved.get('C')!.titles.map((title) => title.imdbId)).toEqual(['tt1']);
});

it.each(['empty', 'match'] as const)(
	'skips a %s failure and preserves earlier review while importing the rest',
	async (failure) => {
		const { queue, saved, events } = setup(failure);
		await queue.continue(signal());
		expect(queue.skipUnfinished()).toBe(true);
		expect(queue.entries[1].run.state.phase).toBe('skipped');
		expect(queue.progress).toContain('C (3 of 3)');
		await queue.continue(signal());
		expect([...saved.keys()]).toEqual(['A', 'C']);
		expect(events.filter((event) => event === 'create A')).toHaveLength(1);
		expect(queue.entries[0].run.unresolvedText()).toBe('Review');
		expect(queue.unfinished).toBeUndefined();
	}
);
it('refuses to skip a known created list with its initial save pending', async () => {
	const { queue } = setup('save');
	await queue.continue(signal());
	expect(queue.unfinished?.run.canSkip).toBe(false);
	expect(queue.skipUnfinished()).toBe(false);
	expect(queue.unfinished?.run.name).toBe('B');
});
it('refuses to skip an active run or an uncertain creation', async () => {
	const { queue } = setup();
	let release!: () => void;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match'))
			return response([
				{ status: 'matched', title: title(1) },
				{ status: 'none', reason: 'No match' },
			]);
		if (init.method === 'GET') return response([]);
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		throw new Error('Lost creation response');
	});
	const pending = queue.continue(signal());
	await vi.waitFor(() => expect(release).toBeTypeOf('function'));
	expect(queue.skipUnfinished()).toBe(false);
	release();
	await pending;
	expect(queue.unfinished?.run.state.phase).toBe('stopped');
	expect(queue.unfinished?.run.canSkip).toBe(false);
	expect(queue.skipUnfinished()).toBe(false);
});
