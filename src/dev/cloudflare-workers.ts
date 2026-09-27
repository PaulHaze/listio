// Node stand-in for `cloudflare:workers`, used only by `pnpm dev` (see ADR 0004).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STATE_DIR = resolve('.wrangler/node-dev');

function readDevVars(): Record<string, string> {
	const path = resolve('.dev.vars');
	if (!existsSync(path)) return {};
	const vars: Record<string, string> = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
	}
	return vars;
}

function fileKV(binding: string): KVNamespace {
	const path = resolve(STATE_DIR, `${binding}.json`);
	const load = (): Record<string, string> =>
		existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
	const save = (data: Record<string, string>) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(data, null, '\t'));
	};

	const kv = {
		async get(key: string, options?: 'text' | 'json' | { type?: string }) {
			const value = load()[key];
			if (value === undefined) return null;
			const type = typeof options === 'string' ? options : options?.type;
			return type === 'json' ? JSON.parse(value) : value;
		},
		async put(key: string, value: string) {
			const data = load();
			data[key] = value;
			save(data);
		},
		async delete(key: string) {
			const data = load();
			delete data[key];
			save(data);
		},
		async list(options?: { prefix?: string }) {
			const keys = Object.keys(load())
				.filter((name) => name.startsWith(options?.prefix ?? ''))
				.sort()
				.map((name) => ({ name }));
			return { keys, list_complete: true, cacheStatus: null };
		},
	};
	return kv as unknown as KVNamespace;
}

export const env = {
	...readDevVars(),
	LISTIO: fileKV('LISTIO'),
} as unknown as Cloudflare.Env;
