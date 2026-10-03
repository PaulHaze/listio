import type { CombinedList, SourceRecord, Title } from '../domain/types.ts';
import { MAX_NAME_LENGTH } from './http.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const integer = (value: unknown): value is number =>
	Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;
const nullableText = (value: unknown) =>
	value === null || typeof value === 'string';
export function isTitle(value: unknown): value is Title {
	if (!isRecord(value)) return false;
	return (
		typeof value.imdbId === 'string' &&
		/^tt\d+$/.test(value.imdbId) &&
		(value.type === 'movie' || value.type === 'series') &&
		text(value.name) &&
		(value.year === null || (integer(value.year) && value.year > 0)) &&
		nullableText(value.blurb) &&
		(value.poster === null ||
			(typeof value.poster === 'string' &&
				/^https?:\/\//.test(value.poster))) &&
		(value.tmdbId === null || (integer(value.tmdbId) && value.tmdbId > 0)) &&
		integer(value.addedSeq)
	);
}
function isSource(value: unknown): value is SourceRecord {
	return (
		isRecord(value) &&
		text(value.url) &&
		/^https?:\/\//.test(value.url) &&
		['trakt', 'mdblist', 'imdb', 'imdb-csv'].includes(value.site as string) &&
		typeof value.addedAt === 'string' &&
		Number.isFinite(Date.parse(value.addedAt)) &&
		integer(value.titleCount) &&
		integer(value.skippedNoImdb)
	);
}
/** Accept only the editable fields, preserving the server's identity and metadata. */
export function savedDraft(
	body: unknown,
	current: CombinedList
): CombinedList | null {
	if (
		!isRecord(body) ||
		!integer(body.version) ||
		body.version < 1 ||
		!['newest', 'oldest', 'az', 'added'].includes(body.sort as string) ||
		!Array.isArray(body.titles) ||
		!body.titles.every(isTitle) ||
		!Array.isArray(body.removed) ||
		!body.removed.every(isTitle) ||
		!Array.isArray(body.sources) ||
		!body.sources.every(isSource)
	)
		return null;
	const name =
		body.name === undefined
			? current.name
			: typeof body.name === 'string'
				? body.name.trim()
				: '';
	if (!name || name.length > MAX_NAME_LENGTH) return null;
	const titles: Title[] = [...body.titles, ...body.removed];
	if (
		new Set(titles.map((t) => t.imdbId)).size !== titles.length ||
		new Set(titles.map((t) => t.addedSeq)).size !== titles.length
	)
		return null;
	const nextSeq = titles.reduce(
		(next, t) => Math.max(next, t.addedSeq + 1),
		current.nextSeq
	);
	if (!Number.isSafeInteger(nextSeq)) return null;
	return {
		...current,
		name,
		version: body.version,
		sort: body.sort as CombinedList['sort'],
		titles: body.titles,
		removed: body.removed,
		sources: body.sources,
		nextSeq,
	};
}
