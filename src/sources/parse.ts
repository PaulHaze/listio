/** Guards shared by the Source and TMDB clients for reading untyped API JSON. */

export type JsonRecord = Record<string, unknown>;

export function record(value: unknown): JsonRecord | null {
	return typeof value === 'object' && value !== null
		? (value as JsonRecord)
		: null;
}

export function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A positive integer id (e.g. a TMDB id), from a number or an all-digit string. */
export function positiveInt(value: unknown): number | null {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+$/.test(value.trim())
				? Number(value.trim())
				: NaN;
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** A release year, from a number, a `2016` string or an ISO `2016-11-10` date. */
export function yearValue(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isInteger(value) && value > 0 ? value : null;
	}
	if (typeof value !== 'string') return null;
	const match = /^(\d{4})(?:$|-)/.exec(value.trim());
	return match ? Number(match[1]) : null;
}

/** A lower-cased `tt…` IMDb id, or null for anything else. */
export function imdbValue(value: unknown): string | null {
	const id = nonEmptyString(value)?.toLowerCase();
	return id && /^tt\d+$/.test(id) ? id : null;
}
