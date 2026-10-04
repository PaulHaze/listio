// @vitest-environment happy-dom
import { act, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	Candidates,
	NeedALook,
	type ReviewLine,
} from '../src/components/titles/TitleControls.tsx';
import TitleDiscovery from '../src/components/editor/TitleDiscovery.tsx';
import { createDraft, removeTitles } from '../src/components/editor/draft.ts';
import { addTitle } from '../src/domain/merge.ts';
import type { CombinedList, Title } from '../src/domain/types.ts';
import type { Candidate } from '../src/tmdb/search.ts';
const candidate = (id: number): Candidate => ({
	tmdbId: id,
	type: 'movie',
	name: `Title ${id}`,
	year: 2000,
	poster: null,
});
const title = (id: number): Title => ({
	...candidate(id),
	imdbId: `tt${id}`,
	blurb: null,
	addedSeq: 0,
});
const empty = { titles: [], removed: [] };
const row = (id: number): ReviewLine => ({
	line: `Line ${id}`,
	name: `Line ${id}`,
	resolved: false,
	result: { status: 'ambiguous', candidates: [candidate(id)] },
});
const response = (body: unknown) => new Response(JSON.stringify(body));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
const render = async (node: ReactNode) => act(async () => root.render(node));
const button = (label: string, within: Element = host) => {
	const found = Array.from(within.querySelectorAll('button')).find(
		(b) => b.textContent === label
	);
	if (!found) throw new Error(`Missing button ${label}: ${host.textContent}`);
	return found;
};
const click = async (label: string, within: Element = host) =>
	act(async () => button(label, within).click());
async function fill(
	element: HTMLInputElement | HTMLTextAreaElement,
	value: string
) {
	await act(async () => {
		const prototype =
			element instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
			element,
			value
		);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
describe('shared title review controls', () => {
	it('awaits additions, blocks repeated candidate/Skip clicks, keeps failures unresolved and allows retry', async () => {
		vi.stubGlobal('fetch', async () => response(title(21001)));
		let reject!: (error: Error) => void;
		const add = vi
			.fn()
			.mockImplementationOnce(
				() => new Promise((_resolve, fail) => (reject = fail))
			)
			.mockResolvedValueOnce('added');
		const onResolved = vi.fn(),
			busy = vi.fn();
		await render(
			<NeedALook
				rows={[row(21001)]}
				current={empty}
				disabled={false}
				add={add}
				busy={busy}
				onResolved={onResolved}
			/>
		);
		await click('Add');
		expect(button('Adding…').disabled).toBe(true);
		expect(button('Skip').disabled).toBe(true);
		await click('Adding…');
		await click('Skip');
		expect(add).toHaveBeenCalledTimes(1);
		expect(onResolved).not.toHaveBeenCalled();
		await act(async () => reject(new Error('Save failed. Try again.')));
		expect(host.querySelector('[role="alert"]')?.textContent).toBe(
			'Save failed. Try again.'
		);
		expect(onResolved).not.toHaveBeenCalled();
		expect(button('Add').disabled).toBe(false);
		await click('Add');
		expect(onResolved).toHaveBeenCalledWith(0, 'added', title(21001));
		expect(busy.mock.calls.flat()).toEqual([1, -1, 1, -1]);
	});
	it('allows Skip without adding a Title', async () => {
		const add = vi.fn(),
			onResolved = vi.fn();
		await render(
			<NeedALook
				rows={[row(21002)]}
				current={empty}
				disabled={false}
				add={add}
				busy={() => {}}
				onResolved={onResolved}
			/>
		);
		await click('Skip');
		expect(onResolved).toHaveBeenCalledWith(0, undefined, undefined);
		expect(add).not.toHaveBeenCalled();
	});
	it('prefills a no-match search and resolves only after its candidate addition', async () => {
		vi.useFakeTimers();
		const c = candidate(21003);
		const fetcher = vi.fn(async (url: string) =>
			response(url.startsWith('/api/search') ? [c] : title(c.tmdbId))
		);
		vi.stubGlobal('fetch', fetcher);
		const add = vi.fn(() => 'added' as const),
			onResolved = vi.fn();
		await render(
			<NeedALook
				rows={[
					{
						...row(21003),
						name: 'Missing name',
						result: { status: 'none', reason: 'No match' },
					},
				]}
				current={empty}
				disabled={false}
				add={add}
				busy={() => {}}
				onResolved={onResolved}
			/>
		);
		expect(host.querySelector('input')?.value).toBe('Missing name');
		await act(async () => vi.advanceTimersByTimeAsync(350));
		expect(fetcher.mock.calls[0][0]).toBe('/api/search?q=Missing%20name');
		await click('Add');
		expect(onResolved).toHaveBeenCalledWith(0, 'added', title(21003));
	});
	it('recognizes IMDb-only active and Removed Titles and retains Add/Added/In list/Restore labels', async () => {
		const active = { ...title(21004), tmdbId: null },
			removed = { ...title(21005), tmdbId: null };
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) =>
			response(title(JSON.parse(init.body as string).tmdbId))
		);
		const add = vi.fn(() => 'restored' as const);
		await render(
			<Candidates
				candidates={[candidate(21004), candidate(21005), candidate(21006)]}
				current={{ titles: [active], removed: [removed] }}
				disabled={false}
				add={add}
				busy={() => {}}
			/>
		);
		expect(button('In list').disabled).toBe(true);
		expect(button('Restore').disabled).toBe(false);
		expect(button('Add').disabled).toBe(false);
		await click('Restore');
		expect(add).toHaveBeenCalledWith(title(21005));
		await render(
			<Candidates
				candidates={[candidate(21004)]}
				current={{
					titles: [active],
					removed: [],
					newIds: new Set([active.imdbId]),
				}}
				disabled={false}
				add={add}
				busy={() => {}}
			/>
		);
		expect(button('✓ Added').disabled).toBe(true);
	});
	it('aborts outstanding lookup on unmount and never adds or resolves afterwards', async () => {
		let signal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			(_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					signal = init.signal!;
					signal.addEventListener('abort', () => reject(signal!.reason));
				})
		);
		const add = vi.fn(),
			onResolved = vi.fn(),
			busy = vi.fn();
		await render(
			<NeedALook
				rows={[row(21007)]}
				current={empty}
				disabled={false}
				add={add}
				busy={busy}
				onResolved={onResolved}
			/>
		);
		await click('Add');
		await render(null);
		expect(signal?.aborted).toBe(true);
		expect(add).not.toHaveBeenCalled();
		expect(onResolved).not.toHaveBeenCalled();
		expect(busy.mock.calls.flat()).toEqual([1, -1]);
	});
});
const list: CombinedList = {
	id: 'test',
	name: 'Test',
	titles: [],
	removed: [],
	sources: [],
	nextSeq: 0,
	version: 1,
	sort: 'added',
	updatedAt: '',
};
function DiscoveryOwner({ id = 'test' }: { id?: string }) {
	const [draft, setDraft] = useState(() => createDraft({ ...list, id }));
	const ref = useRef(draft);
	ref.current = draft;
	return (
		<>
			<TitleDiscovery
				draft={draft}
				saving={false}
				busy={() => {}}
				add={(title) => {
					const result = addTitle(ref.current, title);
					ref.current = result.draft;
					setDraft(result.draft);
					return result.status;
				}}
			/>
			<output>
				{draft.titles.length} active, {draft.removed.length} removed
			</output>
			<button
				onClick={() =>
					setDraft(
						removeTitles(
							ref.current,
							ref.current.titles.map((t) => t.imdbId)
						)
					)
				}
			>
				Remove all
			</button>
		</>
	);
}
describe('editor reconciliation through shared controls', () => {
	it('remembers no-match review choices on repeat paste, restores Removed Titles and scopes choices to their owner', async () => {
		vi.useFakeTimers();
		const c = candidate(22001);
		vi.stubGlobal('fetch', async (url: string) =>
			response(
				url.endsWith('/match')
					? [{ status: 'none', reason: 'No match' }]
					: url.startsWith('/api/search')
						? [c]
						: title(c.tmdbId)
			)
		);
		await render(<DiscoveryOwner />);
		await fill(host.querySelector('textarea')!, 'Unknown line');
		await click('Find titles');
		await act(async () => vi.advanceTimersByTimeAsync(350));
		await click('Add', host.querySelector('.match-review')!);
		expect(host.textContent).toContain(
			'1 added · 0 already in list · 0 need a look'
		);
		await click('Find titles');
		expect(host.textContent).toContain(
			'0 added · 1 already in list · 0 need a look'
		);
		await click('Remove all');
		await click('Find titles');
		expect(host.textContent).toContain(
			'1 added · 0 already in list · 0 need a look'
		);
		expect(host.querySelector('output')?.textContent).toBe(
			'1 active, 0 removed'
		);
		await render(<DiscoveryOwner key="second" id="second" />);
		await fill(host.querySelector('textarea')!, 'Unknown line');
		await click('Find titles');
		expect(host.textContent).toContain(
			'0 added · 0 already in list · 1 need a look'
		);
	});
	it('reconciles repeated ambiguous lines against current candidate identity', async () => {
		const c = candidate(22002);
		vi.stubGlobal('fetch', async (url: string) =>
			response(
				url.endsWith('/match')
					? [{ status: 'ambiguous', candidates: [c] }]
					: title(c.tmdbId)
			)
		);
		await render(<DiscoveryOwner />);
		await fill(host.querySelector('textarea')!, 'Ambiguous line');
		await click('Find titles');
		await click('Add', host.querySelector('.match-review')!);
		await click('Find titles');
		expect(host.textContent).toContain(
			'0 added · 1 already in list · 0 need a look'
		);
	});
});
