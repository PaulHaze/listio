// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import ExportCollection from '../src/components/export/ExportCollection.tsx';

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
	vi.useRealTimers();
});
const lists = [
	{
		id: 'movies',
		name: 'Movies',
		count: 1,
		types: ['movie'] as ('movie' | 'series')[],
	},
	{ id: 'empty', name: 'Empty', count: 0, types: [] },
	{
		id: 'mixed',
		name: 'Mixed',
		count: 2,
		types: ['movie', 'series'] as ('movie' | 'series')[],
	},
];
async function fillName(value: string) {
	const input = host.querySelector<HTMLInputElement>('#collection-name')!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			'value'
		)!.set!.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
it('preselects imported lists in order, excludes unknown/empty IDs, reorders and downloads configured Catalog references', async () => {
	vi.useFakeTimers();
	let blob!: Blob;
	const create = vi
		.spyOn(URL, 'createObjectURL')
		.mockImplementation((value) => {
			blob = value as Blob;
			return 'blob:collection';
		});
	const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	let download = '';
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
		this: HTMLAnchorElement
	) {
		download = this.download;
	});
	await act(async () =>
		root.render(
			<ExportCollection
				lists={lists}
				addonId="org.listio.custom"
				initialSelected={['mixed', 'empty', 'missing', 'movies', 'mixed']}
			/>
		)
	);
	expect(host.querySelector<HTMLInputElement>('#collection-name')!.value).toBe(
		''
	);
	const boxes = [
		...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
	];
	expect(boxes.map((box) => box.checked)).toEqual([true, false, true]);
	expect(boxes[1].disabled).toBe(true);
	expect(
		[...host.querySelectorAll('ol li')].map(
			(row) => row.textContent?.split(' ')[0]
		)
	).toEqual(['Mixed', 'Movies']);
	expect(
		host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
	).toBe(true);
	await fillName(' Weekend Picks ');
	await act(async () =>
		host
			.querySelector<HTMLButtonElement>('[aria-label="Move Movies up"]')!
			.click()
	);
	await act(async () =>
		host
			.querySelector('form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
	);
	expect(create).toHaveBeenCalledTimes(1);
	expect(download).toBe('Weekend Picks.json');
	const [collection] = JSON.parse(await blob.text());
	expect(
		collection.folders.map((folder: { title: string }) => folder.title)
	).toEqual(['Movies', 'Mixed']);
	expect(collection.folders[1].catalogSources).toEqual(
		['movie', 'series'].map((type) => ({
			addonId: 'org.listio.custom',
			type,
			catalogId: 'mixed',
		}))
	);
	expect(host.textContent).toContain('Collection downloaded');
	await act(async () => vi.advanceTimersByTime(1000));
	expect(revoke).toHaveBeenCalledWith('blob:collection');
	await act(async () => {
		boxes[0].click();
		boxes[2].click();
	});
	expect(
		host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
	).toBe(true);
});

it('says when imported lists are not available to export yet', async () => {
	await act(async () =>
		root.render(
			<ExportCollection
				lists={lists}
				addonId="org.listio.custom"
				initialSelected={['movies', 'missing', 'empty']}
			/>
		)
	);
	expect(host.querySelector('[role="status"]')?.textContent).toContain(
		'2 imported lists aren’t available to export yet'
	);
	await act(async () =>
		root.render(
			<ExportCollection
				key="all-available"
				lists={lists}
				addonId="org.listio.custom"
				initialSelected={['movies']}
			/>
		)
	);
	expect(host.querySelector('[role="status"]')).toBeNull();
});

it('keeps failed browser downloads retryable and shows an error', async () => {
	vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
		throw new Error('Download unavailable');
	});
	await act(async () =>
		root.render(
			<ExportCollection
				lists={lists}
				addonId="org.listio.custom"
				initialSelected={['movies']}
			/>
		)
	);
	await fillName('Picks');
	await act(async () =>
		host
			.querySelector('form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
	);
	expect(host.querySelector('[role="alert"]')?.textContent).toBe(
		'Download unavailable'
	);
	expect(
		host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
	).toBe(false);
});
