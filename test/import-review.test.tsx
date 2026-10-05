// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ImportFromText from '../src/components/import/ImportFromText.tsx';
import { clearIdentities } from '../src/client/titleIdentity.ts';
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
const response = (body: unknown) => new Response(JSON.stringify(body));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	clearIdentities();
});
const render = (node: ReactNode) => act(async () => root.render(node));
const button = (label: string, within: Element = host) => {
	const found = Array.from(within.querySelectorAll('button')).find(
		(button) => button.textContent === label
	);
	if (!found) throw new Error(`Missing ${label}: ${host.textContent}`);
	return found;
};
const click = (label: string, within: Element = host) =>
	act(async () => button(label, within).click());
async function fill(selector: string, value: string) {
	const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
		selector
	)!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			element instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype,
			'value'
		)!.set!.call(element, value);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
const warn = () => {
	const event = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
};
it('live structural and name errors block import; uploads replace text without creating a list and show read errors', async () => {
	const fetcher = vi.fn();
	vi.stubGlobal('fetch', fetcher);
	await render(
		<ImportFromText
			initialLists={[{ id: 'old', name: 'Existing', count: 0, types: [] }]}
		/>
	);
	await fill('#import-name', ' existing ');
	await fill('#import-text', '## Heading\nTitle');
	expect(button('Import').disabled).toBe(true);
	expect(host.textContent).toContain('already exists');
	expect(host.textContent).toContain('Line 1');
	expect(host.querySelector('a')?.getAttribute('href')).toBe('/lists/old');
	await fill('#import-name', 'Test');
	const upload = async (file: {
		name: string;
		text: () => Promise<string>;
	}) => {
		const input = host.querySelector<HTMLInputElement>('#import-upload')!;
		Object.defineProperty(input, 'files', {
			configurable: true,
			value: [file],
		});
		await act(async () =>
			input.dispatchEvent(new Event('change', { bubbles: true }))
		);
	};
	await upload({ name: 'titles.md', text: async () => 'Brick (2005)' });
	expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(
		'Brick (2005)'
	);
	expect(button('Import').disabled).toBe(false);
	expect(fetcher).not.toHaveBeenCalled();
	await upload({
		name: 'bad.txt',
		text: async () => {
			throw new Error('Read failed');
		},
	});
	expect(host.textContent).toContain('Unable to read this file');
	expect(button('Import').disabled).toBe(true);
	await fill('#import-text', 'Corrected');
	expect(button('Import').disabled).toBe(false);
});
it('saves picks before resolving, retries failed saves, preserves successive additions and copies only unresolved rows', async () => {
	let saved = empty;
	let fail = false;
	let finish!: () => void;
	const writes: number[][] = [];
	const clipboard = vi.fn(async (_text: string) => {});
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: clipboard },
	});
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match'))
			return response([
				{ status: 'matched', title: title(1) },
				...[2, 3, 4].map((id) => ({
					status: 'ambiguous',
					candidates: [title(id)],
				})),
			]);
		if (url.endsWith('/lookup'))
			return response(title(JSON.parse(init.body as string).tmdbId));
		if (url === '/api/lists' && init.method === 'GET') return response([]);
		if (init.method === 'POST') return response(saved);
		if (init.method === 'GET') return response(saved);
		if (fail) {
			fail = false;
			throw new Error('Save failed. Retry.');
		}
		const next = {
			...saved,
			...JSON.parse(init.body as string),
			version: saved.version + 1,
		};
		if (next.titles.length === 2)
			await new Promise<void>((resolve) => (finish = resolve));
		saved = next;
		writes.push(saved.titles.map((title) => title.tmdbId!));
		return response(saved);
	});
	await render(<ImportFromText initialLists={[]} />);
	await fill('#import-name', 'Test');
	await fill('#import-text', 'Confident\nSecond\nThird\nSkipped');
	await click('Import');
	expect(host.textContent).toContain('1 Titles saved');
	const exportLink = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(exportLink.href).searchParams.getAll('list')).toEqual([
		'test',
	]);
	expect(warn()).toBe(true);
	const rows = () => host.querySelectorAll('.match-review');
	fail = true;
	await click('Add', rows()[0]);
	expect(host.textContent).toContain('Save failed. Retry.');
	expect(rows()).toHaveLength(3);
	await click('Add', rows()[0]);
	expect(rows()).toHaveLength(3);
	expect(button('Skip', rows()[0]).disabled).toBe(true);
	expect(button('Add', rows()[1]).disabled).toBe(true);
	await act(async () => finish());
	expect(rows()).toHaveLength(2);
	await click('Copy unresolved lines');
	expect(clipboard).toHaveBeenLastCalledWith('Third\nSkipped');
	await click('Add', rows()[0]);
	expect(rows()).toHaveLength(1);
	expect(writes).toEqual([[1], [1, 2], [1, 2, 3]]);
	await click('Skip', rows()[0]);
	expect(rows()).toHaveLength(0);
	expect(warn()).toBe(false);
	expect(saved.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
		'tt3',
	]);
});
it('zero confident matches create nothing and allow input correction', async () => {
	const fetcher = vi.fn(async (_url: string) =>
		response([{ status: 'none', reason: 'No match' }])
	);
	vi.stubGlobal('fetch', fetcher);
	await render(<ImportFromText initialLists={[]} />);
	await fill('#import-name', 'Test');
	await fill('#import-text', 'Unknown');
	await click('Import');
	expect(host.textContent).toContain(
		'No titles were found. Check the list format'
	);
	expect(host.textContent).not.toContain('Export these as a Nuvio collection');
	expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/titles/match']);
	expect(host.querySelector<HTMLInputElement>('#import-name')!.disabled).toBe(
		false
	);
	await fill('#import-text', 'Corrected');
	expect(host.textContent).not.toContain('No titles were found');
});

it('offers the collection shortcut only after a pending initial save completes', async () => {
	let fail = true;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match'))
			return response([{ status: 'matched', title: title(1) }]);
		if (url === '/api/lists' && init.method === 'GET') return response([]);
		if (init.method === 'POST' || init.method === 'GET') return response(empty);
		if (fail) throw new Error('Save unavailable');
		return response({
			...empty,
			...JSON.parse(init.body as string),
			version: 2,
		});
	});
	await render(<ImportFromText initialLists={[]} />);
	await fill('#import-name', 'Test');
	await fill('#import-text', 'Confident');
	await click('Import');
	expect(host.textContent).toContain('save pending');
	expect(host.textContent).not.toContain('Export these as a Nuvio collection');
	fail = false;
	await click('Continue import');
	const shortcut = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(shortcut.href).searchParams.getAll('list')).toEqual(['test']);
});

it('keeps an untouched form quiet and validates each edited field', async () => {
	await render(<ImportFromText initialLists={[]} />);
	expect(host.querySelectorAll('[role="alert"]')).toHaveLength(0);
	expect(button('Import').disabled).toBe(true);
	await fill('#import-name', ' ');
	expect(host.textContent).toContain('Enter a list name');
	expect(host.textContent).not.toContain('Paste at least one title');
	await fill('#import-text', ' ');
	expect(host.textContent).toContain('Paste at least one title');
});
it.each(['collision', 'rejected'])(
	'retains matching results while renaming after %s',
	async (failure) => {
		let first = true;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith('/match'))
				return response([{ status: 'matched', title: title(1) }]);
			if (init.method === 'GET') {
				if (failure === 'collision' && first) {
					first = false;
					return response([{ id: 'old', name: 'Test' }]);
				}
				return response([]);
			}
			if (init.method === 'POST') {
				if (first && failure === 'rejected') {
					first = false;
					return new Response(JSON.stringify({ error: 'Name rejected' }), {
						status: 400,
					});
				}
				return response({
					...empty,
					name: JSON.parse(init.body as string).name,
				});
			}
			return response({
				...empty,
				name: 'Renamed',
				...JSON.parse(init.body as string),
				version: 2,
			});
		});
		vi.stubGlobal('fetch', fetcher);
		await render(<ImportFromText initialLists={[]} />);
		await fill('#import-name', 'Test');
		await fill('#import-text', 'One');
		await click('Import');
		expect(host.querySelector<HTMLInputElement>('#import-name')!.disabled).toBe(
			false
		);
		await fill('#import-name', 'Renamed');
		await click('Continue import');
		expect(host.textContent).toContain('1 Titles saved');
		expect(host.textContent).toContain('Renamed');
		expect(
			fetcher.mock.calls.filter(([url]) => url.endsWith('/match'))
		).toHaveLength(1);
	}
);

it('multiple preview keeps edits and selections, repairs errors, and rebuilds when text is replaced', async () => {
	await render(
		<ImportFromText
			initialLists={[{ id: 'old', name: 'Existing', count: 0, types: [] }]}
		/>
	);
	await fill(
		'#import-text',
		'## Existing\nTitle\n## Same\nTitle\n## same\n#Bad'
	);
	await click('Multiple lists');
	expect(host.querySelector('#import-name')).toBeNull();
	expect(button('Import').disabled).toBe(true);
	await fill('#name-section-1', 'Renamed');
	await act(async () =>
		host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].click()
	);
	expect(button('Import').disabled).toBe(false);
	await fill('#name-section-3', "Names: & 'Fine'");
	expect(host.querySelector<HTMLInputElement>('#name-section-1')!.value).toBe(
		'Renamed'
	);
	expect(
		host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].checked
	).toBe(false);
	expect(host.textContent).not.toContain('valid header');
	await fill('#import-text', '## Fresh\nNew Title');
	expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
	expect(host.querySelector<HTMLInputElement>('#name-section-1')!.value).toBe(
		'Fresh'
	);
	expect(
		host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked
	).toBe(true);
});

it('multiple completed review survives interruption, warns on leaving and saves identical picks to the correct lists', async () => {
	const lists = new Map<string, CombinedList>();
	let matching = 0;
	let failPick = true;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match')) {
			matching++;
			if (matching === 2) throw new Error('Queue offline');
			return response([
				{ status: 'matched', title: title(1) },
				{ status: 'ambiguous', candidates: [title(2)] },
			]);
		}
		if (url.endsWith('/lookup')) return response(title(2));
		if (url === '/api/lists' && init.method === 'GET')
			return response([...lists.values()]);
		if (init.method === 'POST') {
			const name = JSON.parse(init.body as string).name;
			const list = { ...empty, id: name, name };
			lists.set(name, list);
			return response(list);
		}
		const id = url.split('/').at(-1)!;
		if (init.method === 'GET') return response(lists.get(id));
		const body = JSON.parse(init.body as string);
		if (body.titles.length === 2 && failPick) {
			failPick = false;
			throw new Error('Pick failed');
		}
		const list = {
			...lists.get(id)!,
			...body,
			version: lists.get(id)!.version + 1,
		};
		lists.set(id, list);
		return response(list);
	});
	await render(<ImportFromText initialLists={[]} />);
	await click('Multiple lists');
	await fill('#import-text', '## A\nShared\nReview\n## B\nShared\nReview');
	await click('Import');
	expect(host.textContent).toContain('Queue offline');
	expect(host.textContent).toContain('B (2 of 2)');
	expect(warn()).toBe(true);
	const result = (name: string) =>
		host.querySelector(`[aria-label="Result: ${name}"]`)!;
	await click('Add', result('A'));
	expect(result('A').textContent).toContain('Pick failed');
	expect(result('A').querySelectorAll('.match-review')).toHaveLength(1);
	await click('Continue import');
	expect(result('A').querySelectorAll('.match-review')).toHaveLength(1);
	expect(result('B').querySelectorAll('.match-review')).toHaveLength(1);
	await click('Add', result('A'));
	expect(result('B').querySelectorAll('.match-review')).toHaveLength(1);
	await click('Add', result('B'));
	expect(lists.get('A')!.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
	]);
	expect(lists.get('B')!.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
	]);
	expect(warn()).toBe(false);
});

function multipleServer(second: 'collision' | 'empty' | 'delayed' | 'offline') {
	const lists = new Map<string, CombinedList>();
	const creates: string[] = [];
	let matches = 0;
	let release!: () => void;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		if (url.endsWith('/match')) {
			matches++;
			if (matches === 2) {
				if (second === 'offline') throw new Error('Offline');
				if (second === 'empty')
					return response([{ status: 'none', reason: 'No match' }]);
				if (second === 'delayed')
					await new Promise<void>((resolve) => {
						release = resolve;
					});
			}
			return response([
				{ status: 'matched', title: title(1) },
				...(matches === 1
					? [
							second === 'offline'
								? { status: 'matched', title: title(2) }
								: { status: 'ambiguous', candidates: [title(2)] },
						]
					: []),
			]);
		}
		if (url.endsWith('/lookup')) return response(title(2));
		if (url === '/api/lists' && init.method === 'GET')
			return response([
				...lists.values(),
				...(second === 'collision' ? [{ name: 'B' }] : []),
			]);
		if (init.method === 'POST') {
			const name = JSON.parse(init.body as string).name;
			creates.push(name);
			const list = { ...empty, id: name, name };
			lists.set(name, list);
			return response(list);
		}
		const id = url.split('/').at(-1)!;
		if (init.method === 'GET') return response(lists.get(id));
		const list = {
			...lists.get(id)!,
			...JSON.parse(init.body as string),
			version: lists.get(id)!.version + 1,
		};
		lists.set(id, list);
		return response(list);
	});
	return { lists, creates, release: () => release() };
}
async function startMultiple() {
	await render(<ImportFromText initialLists={[]} />);
	await click('Multiple lists');
	await fill(
		'#import-text',
		'## A\nShared\nReview\n## B\nShared\n## C\nShared'
	);
	await click('Import');
}
it('renames only a rejected queue section, gates invalid edits and continues without replaying completed lists', async () => {
	const { creates } = multipleServer('collision');
	await startMultiple();
	expect(host.textContent).toContain('already exists');
	const inputs = [
		...host.querySelectorAll<HTMLInputElement>('input[id^="name-section"]'),
	];
	expect(inputs.map((input) => input.disabled)).toEqual([true, false, true]);
	await fill('#name-section-4', 'A');
	expect(button('Continue import').disabled).toBe(true);
	await fill('#name-section-4', 'Renamed');
	expect(host.textContent).not.toContain('already exists');
	expect(button('Continue import').disabled).toBe(false);
	expect(inputs[1].parentElement?.textContent).toContain(
		'Import “Renamed” (line 4)'
	);
	await click('Continue import');
	expect(creates).toEqual(['A', 'Renamed', 'C']);
	expect(host.textContent).toContain('Import complete.');
	const shortcut = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(shortcut.href).searchParams.getAll('list')).toEqual([
		'A',
		'Renamed',
		'C',
	]);
});
it('skips an empty section in the UI and retains completed review while continuing later sections', async () => {
	const { creates } = multipleServer('empty');
	await startMultiple();
	const first = host.querySelector('[aria-label="Result: A"]')!;
	expect(first.querySelectorAll('.match-review')).toHaveLength(1);
	await click('Skip this list');
	expect(host.textContent).toContain('Skipped; no list created.');
	await click('Continue import');
	expect(creates).toEqual(['A', 'C']);
	const shortcut = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(shortcut.href).searchParams.getAll('list')).toEqual([
		'A',
		'C',
	]);
	expect(first.querySelectorAll('.match-review')).toHaveLength(1);
});
it('saves a finished list review pick while a later section is still matching', async () => {
	const { lists, release } = multipleServer('delayed');
	await startMultiple();
	const exportLink = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(exportLink.href).searchParams.getAll('list')).toEqual(['A']);
	const first = host.querySelector('[aria-label="Result: A"]')!;
	expect(button('Add', first).disabled).toBe(false);
	await click('Add', first);
	expect(lists.get('A')?.titles.map((title) => title.imdbId)).toEqual([
		'tt1',
		'tt2',
	]);
	expect(lists.has('B')).toBe(false);
	expect(first.querySelectorAll('.match-review')).toHaveLength(0);
	await act(async () => release());
	expect(lists.get('B')?.titles.map((title) => title.imdbId)).toEqual(['tt1']);
	expect(host.textContent).toContain('Import complete.');
});
it('warns when a stopped queue has unfinished sections even without review or a pending save', async () => {
	multipleServer('offline');
	await startMultiple();
	expect(host.querySelectorAll('.match-review')).toHaveLength(0);
	expect(host.textContent).toContain('Offline');
	expect(host.textContent).not.toContain('save pending');
	expect(warn()).toBe(true);
	await click('Skip this list');
	await click('Continue import');
	expect(host.textContent).toContain('Import complete.');
	expect(warn()).toBe(false);
});

it('collection mode prefills its title, validates source headers live and retains the section preview', async () => {
	await render(
		<ImportFromText
			initialLists={[
				{ id: 'old', name: 'Existing', count: 1, types: ['movie'] },
			]}
			initialCollection="Weekend"
		/>
	);
	expect(host.querySelector<HTMLInputElement>('#collection-title')!.value).toBe(
		'Weekend'
	);
	expect(host.querySelector('[aria-label="Import mode"]')).toBeNull();
	expect(host.querySelector('#import-name')).toBeNull();
	await fill('#import-text', '## A\nTitle\n##  a \nTitle');
	expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
	expect(button('Import').disabled).toBe(true);
	expect(host.textContent).toContain(
		'Lines 1 and 3: the header "a" is used twice. Each header must be unique. Edit the text box'
	);
	await fill('#name-section-3', 'Renamed');
	expect(button('Import').disabled).toBe(true);
	await fill('#import-text', '## A\nTitle\n## B\nTitle');
	expect(button('Import').disabled).toBe(false);
	await fill('#collection-title', ' ');
	expect(button('Import').disabled).toBe(true);
	expect(host.textContent).toContain(
		'Enter a collection title of 100 characters or fewer.'
	);
	await fill('#collection-title', 'x'.repeat(101));
	expect(button('Import').disabled).toBe(true);
	await fill('#collection-title', 'Good');
	await fill('#import-text', 'Title');
	expect(host.textContent).toContain(
		'A collection needs a "## " header for each list.'
	);
	expect(host.textContent).not.toContain('Switch to Single list');
	await fill('#import-text', '## existing\nTitle');
	expect(host.textContent).toContain('Change the header in the text box.');
	expect(button('Import').disabled).toBe(true);
	await fill('#import-text', 'Title\n## A\nTitle');
	expect(host.textContent).toContain('Line 1: "Title" is above the first');
	expect(button('Import').disabled).toBe(true);
});

it('downloads completed collection runs in file order after the queue finishes, including review picks and series but excluding skipped lists', async () => {
	const lists = new Map<string, CombinedList>();
	let matches = 0;
	const series = { ...title(2), type: 'series' as const };
	const fetcher = vi.fn(async (url: string, init: RequestInit) => {
		if (url.endsWith('/match')) {
			matches++;
			if (matches === 2)
				return response([{ status: 'none', reason: 'No match' }]);
			return response(
				matches === 1
					? [
							{ status: 'matched', title: title(1) },
							{ status: 'ambiguous', candidates: [series] },
						]
					: [{ status: 'matched', title: series }]
			);
		}
		if (url.endsWith('/lookup')) return response(series);
		if (url === '/api/lists' && init.method === 'GET')
			return response([...lists.values()]);
		if (init.method === 'POST') {
			const name = JSON.parse(init.body as string).name;
			const list = { ...empty, id: name, name };
			lists.set(name, list);
			return response(list);
		}
		const id = url.split('/').at(-1)!;
		if (init.method === 'GET') return response(lists.get(id));
		const list = {
			...lists.get(id)!,
			...JSON.parse(init.body as string),
			version: lists.get(id)!.version + 1,
		};
		lists.set(id, list);
		return response(list);
	});
	vi.stubGlobal('fetch', fetcher);
	let blob!: Blob;
	vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
		blob = value as Blob;
		return 'blob:collection';
	});
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	let filename = '';
	const download = vi
		.spyOn(HTMLAnchorElement.prototype, 'click')
		.mockImplementation(function (this: HTMLAnchorElement) {
			filename = this.download;
		});
	await render(
		<ImportFromText
			initialLists={[]}
			initialCollection="Weekend & 'Picks'"
			addonId="org.listio.custom"
		/>
	);
	await fill(
		'#import-text',
		'## Movies\nOne\nReview\n## Skip\nUnknown\n## Shows\nTwo'
	);
	await click('Import');
	const dialog = host.querySelector('dialog')!;
	expect(dialog.open).toBe(false);
	await click('Skip this list');
	expect(dialog.open).toBe(false);
	await click('Continue import');
	expect(dialog.open).toBe(true);
	expect(document.activeElement).toBe(button('Close', dialog));
	expect(dialog.textContent).toContain('2 folders');
	expect(download).not.toHaveBeenCalled();
	const shortcut = [...host.querySelectorAll('a')].find(
		(link) => link.textContent === 'Export these as a Nuvio collection'
	)!;
	expect(new URL(shortcut.href).searchParams.get('name')).toBe(
		"Weekend & 'Picks'"
	);
	await act(async () =>
		dialog.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		)
	);
	expect(dialog.open).toBe(false);
	await click('Add', host.querySelector('[aria-label="Result: Movies"]')!);
	await fill('#collection-title', 'Current title');
	await click('Download collection');
	expect(dialog.open).toBe(true);
	fetcher.mockClear();
	await click('Download collection', dialog);
	expect(fetcher).not.toHaveBeenCalled();
	expect(filename).toBe('Current title.json');
	const [collection] = JSON.parse(await blob.text());
	expect(collection.title).toBe('Current title');
	expect(
		collection.folders.map((folder: { title: string }) => folder.title)
	).toEqual(['Movies', 'Shows']);
	expect(
		collection.folders.map((folder: { catalogSources: { type: string }[] }) =>
			folder.catalogSources.map((source) => source.type)
		)
	).toEqual([['movie', 'series'], ['series']]);
	expect(collection.folders[0].catalogSources[0].addonId).toBe(
		'org.listio.custom'
	);
	expect(dialog.textContent).toContain(
		'Collection downloaded with 2 folders. Import the JSON in Nuvio.'
	);
	await click('Close', dialog);
	expect(dialog.open).toBe(false);
});
