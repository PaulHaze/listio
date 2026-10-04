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
	expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/titles/match']);
	expect(host.querySelector<HTMLInputElement>('#import-name')!.disabled).toBe(
		false
	);
	await fill('#import-text', 'Corrected');
	expect(host.textContent).not.toContain('No titles were found');
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
