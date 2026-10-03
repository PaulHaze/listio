import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CombinedList } from '../src/domain/types.ts';
import { mergeTitles } from '../src/domain/merge.ts';
import { slugify } from '../src/domain/slug.ts';
import { detectSource } from '../src/sources/detect.ts';
import { fetchTrakt } from '../src/sources/trakt.ts';
import { fetchMdbList } from '../src/sources/mdblist.ts';
import { putList, type ListStore } from '../src/storage/lists.ts';
import { enrichTitles } from '../src/tmdb/enrich.ts';
import { readDevVars, requiredValue } from './probe-utils.ts';

// Wrangler's CLI uses existing login/config. Never put API secrets in arguments.
function wrangler(args: string[]): string {
	const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
		encoding: 'utf8',
	});
	if (result.status !== 0) throw new Error(result.stderr || 'Wrangler failed.');
	return result.stdout;
}

async function remoteStore(): Promise<ListStore> {
	const dir = await mkdtemp(join(tmpdir(), 'listio-seed-'));
	const valuePath = join(dir, 'value.json');
	// Expose cleanup to the caller without writing seed data into the repository.
	cleanup = () => rm(dir, { recursive: true, force: true });
	return {
		async get(key: string, type?: 'text' | 'json') {
			// Read with the REST API through Wrangler; missing keys are null.
			let raw: string;
			try {
				raw = wrangler([
					'kv',
					'key',
					'get',
					key,
					'--binding',
					'LISTIO',
					'--remote',
				]);
			} catch (error) {
				// Wrangler's wording varies by version; any 404/not-found is a miss.
				if (error instanceof Error && /\b404\b|not found/i.test(error.message))
					return null;
				throw error;
			}
			if (!raw.trim() || /^value not found$/i.test(raw.trim())) return null;
			return type === 'json' ? JSON.parse(raw) : raw;
		},
		async put(key: string, value: string) {
			await writeFile(valuePath, value, { mode: 0o600 });
			wrangler([
				'kv',
				'key',
				'put',
				key,
				'--path',
				valuePath,
				'--binding',
				'LISTIO',
				'--remote',
			]);
		},
		async delete(key: string) {
			wrangler(['kv', 'key', 'delete', key, '--binding', 'LISTIO', '--remote']);
		},
	} as unknown as ListStore;
}

let cleanup: (() => Promise<void>) | undefined;
try {
	const args = process.argv.slice(2);
	const remote = args.includes('--remote');
	const values = args.filter((arg) => arg !== '--remote');
	const [name, ...urls] = values;
	if (!name || urls.length === 0)
		throw new Error(
			'Usage: pnpm seed:list [--remote] "Combined List name" SOURCE_URL [SOURCE_URL ...]'
		);
	const vars = readDevVars();
	const kv = remote
		? await remoteStore()
		: (await import('../src/dev/cloudflare-workers.ts')).env.LISTIO;
	const id = slugify(name);
	if (!id) throw new Error('The name must contain letters or numbers.');
	if ((await kv.get(`list:${id}`)) !== null)
		throw new Error('This Combined List already exists. Choose another name.');
	const index = await kv.get<{ id: string }[]>('index', 'json');
	if (index?.some((entry) => entry.id === id))
		throw new Error(
			'This Combined List ID is already indexed. Choose another name.'
		);
	let list: CombinedList = {
		id,
		name,
		sort: 'added',
		sources: [],
		titles: [],
		removed: [],
		nextSeq: 0,
		version: 0,
		updatedAt: '',
	};
	for (const url of urls) {
		const source = detectSource(url);
		const result =
			source.site === 'trakt'
				? await fetchTrakt(source, requiredValue('TRAKT_CLIENT_ID', vars))
				: source.site === 'mdblist'
					? await fetchMdbList(source, requiredValue('MDBLIST_API_KEY', vars))
					: null;
		if (!result)
			throw new Error('The seed script supports Trakt and MDBList Sources.');
		const merged = mergeTitles(list, result.titles);
		// newTitles already carry the addedSeq assigned across all Sources.
		const titles = await enrichTitles(
			merged.newTitles,
			requiredValue('TMDB_API_KEY', vars)
		);
		list = {
			...list,
			titles: [...list.titles, ...titles],
			nextSeq: merged.nextSeq,
			sources: [
				...list.sources,
				{
					url,
					site: source.site,
					addedAt: new Date().toISOString(),
					titleCount: result.titles.length,
					skippedNoImdb: result.skippedNoImdb,
				},
			],
		};
	}
	const saved = await putList(kv, list);
	console.log(
		JSON.stringify(
			{
				id: saved.id,
				count: saved.titles.length,
				posters: saved.titles.filter((title) => title.poster).length,
				types: [...new Set(saved.titles.map((title) => title.type))],
				version: saved.version,
				target: remote ? 'remote KV' : 'Node dev KV',
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Seeding failed.');
	process.exitCode = 1;
} finally {
	await cleanup?.();
}
