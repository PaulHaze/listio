// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Editor from '../src/components/editor/Editor.tsx';
import { savedDraft } from '../src/api/validate.ts';
import { buildCatalog } from '../src/addon/catalog.ts';
import type { CombinedList, Title } from '../src/domain/types.ts';

const title = (id: number): Title => ({
	imdbId: `tt${id}`,
	name: `Title ${id}`,
	type: 'movie',
	year: 2000,
	poster: null,
	blurb: null,
	tmdbId: id,
	addedSeq: id,
});
const initial: CombinedList = {
	id: 'import-existing-id',
	name: 'Existing list',
	titles: [title(1)],
	removed: [title(2)],
	sources: [],
	nextSeq: 3,
	version: 7,
	sort: 'added',
	updatedAt: '',
	showOnHome: true,
};
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
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function button(label: string) {
	const found = [...host.querySelectorAll('button')].find(
		(b) => b.textContent === label
	);
	if (!found) throw new Error(`Missing button ${label}`);
	return found;
}
const click = async (label: string) => act(async () => button(label).click());
async function paste(text: string) {
	await act(async () => {
		const input = host.querySelector('textarea')!;
		Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			'value'
		)!.set!.call(input, text);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
describe('clear list contents', () => {
	it('allows cancellation and replaces overlapping titles through the original list endpoint only on Save', async () => {
		let persisted = initial;
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			if (url === '/api/titles/match')
				return new Response(
					JSON.stringify(
						[1, 2, 3].map((id) => ({ status: 'matched', title: title(id) }))
					)
				);
			expect(url).toBe(`/api/lists/${initial.id}`);
			expect(init.method).toBe('PUT');
			const validated = savedDraft(JSON.parse(init.body as string), persisted);
			expect(validated).not.toBeNull();
			persisted = { ...validated!, version: persisted.version + 1 };
			return new Response(JSON.stringify(persisted));
		});
		vi.stubGlobal('fetch', fetcher);
		const confirm = vi.fn(() => false);
		vi.stubGlobal('confirm', confirm);
		await act(async () =>
			root.render(<Editor initialList={initial} created={false} />)
		);
		await click('Clear all titles');
		expect(button('All (1)')).toBeDefined();
		expect(fetcher).not.toHaveBeenCalled();
		confirm.mockReturnValue(true);
		await click('Clear all titles');
		expect(button('All (0)')).toBeDefined();
		expect(button('Removed (0)')).toBeDefined();
		expect(button('Save').disabled).toBe(false);
		expect(persisted).toBe(initial);
		await paste('Title 1\nTitle 2\nTitle 3');
		await click('Find titles');
		expect(button('All (3)')).toBeDefined();
		expect(host.textContent).toContain('3 added · 0 already in list');
		await click('Save');
		expect(persisted).toMatchObject({
			id: initial.id,
			name: initial.name,
			showOnHome: true,
			removed: [],
			version: 8,
		});
		expect(buildCatalog(persisted, 'movie').metas.map((t) => t.id)).toEqual([
			'tt1',
			'tt2',
			'tt3',
		]);
		expect(host.textContent).toContain('0 unsaved changes');
	});
	it('blocks clearing during matching and can save an empty list without deleting its identity', async () => {
		let resolve!: (response: Response) => void;
		const fetcher = vi.fn((url: string, init: RequestInit) => {
			if (url === '/api/titles/match')
				return new Promise<Response>((done) => {
					resolve = done;
				});
			expect(url).toBe(`/api/lists/${initial.id}`);
			const body = JSON.parse(init.body as string);
			expect(body).toMatchObject({
				titles: [],
				removed: [],
				sources: [],
				version: initial.version,
			});
			return Promise.resolve(
				new Response(JSON.stringify({ ...initial, ...body, version: 8 }))
			);
		});
		vi.stubGlobal('fetch', fetcher);
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true)
		);
		await act(async () =>
			root.render(<Editor initialList={initial} created={false} />)
		);
		await paste('Title 3');
		await click('Find titles');
		expect(button('Clear all titles').disabled).toBe(true);
		await act(async () =>
			resolve(
				new Response(JSON.stringify([{ status: 'matched', title: title(3) }]))
			)
		);
		expect(button('Clear all titles').disabled).toBe(false);
		await click('Clear all titles');
		await click('Save');
		expect(host.textContent).toContain('0 unsaved changes');
		expect(button('Clear all titles').disabled).toBe(true);
	});
});
