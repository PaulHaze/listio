import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceTitle, Title } from '../src/domain/types.ts';
import { enrichTitles } from '../src/tmdb/enrich.ts';

export function readDevVars(): Record<string, string> {
	const values: Record<string, string> = {};
	const path = resolve('.dev.vars');
	if (!existsSync(path)) return values;

	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) continue;
		values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
	}
	return values;
}

export function requiredValue(
	name: string,
	values: Record<string, string>
): string {
	const value = process.env[name]?.trim() || values[name]?.trim();
	if (!value) {
		throw new Error(
			`${name} is missing. Add it to .dev.vars or the environment.`
		);
	}
	return value;
}

export async function enrichSourceTitles(
	titles: readonly SourceTitle[],
	tmdbApiKey: string
): Promise<Title[]> {
	return enrichTitles(
		titles.map((title, addedSeq) => ({
			...title,
			poster: null,
			blurb: null,
			addedSeq,
		})),
		tmdbApiKey
	);
}

export function printProbeResult(
	site: string,
	url: string,
	titles: readonly Title[],
	skippedNoImdb: number
): void {
	console.log(
		JSON.stringify(
			{
				site,
				url,
				titleCount: titles.length,
				skippedNoImdb,
				titles: titles.slice(0, 10),
			},
			null,
			2
		)
	);
}
