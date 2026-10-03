export type TraktDetectedSource = {
	site: 'trakt';
	url: string;
	user?: string;
	slug?: string;
	listId?: string;
};

export type MdbListDetectedSource = {
	site: 'mdblist';
	url: string;
	user: string;
	slug: string;
};

export type ImdbDetectedSource = {
	site: 'imdb';
	url: string;
	listId: string;
};

export type DetectedSource =
	TraktDetectedSource | MdbListDetectedSource | ImdbDetectedSource;

export class SourceDetectionError extends Error {
	readonly code = 'UNSUPPORTED_SOURCE_URL';

	constructor(message: string) {
		super(message);
		this.name = 'SourceDetectionError';
	}
}

function decodePathSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function pathSegments(pathname: string): string[] {
	return pathname.split('/').filter(Boolean).map(decodePathSegment);
}

function hostIs(hostname: string, ...accepted: string[]): boolean {
	const host = hostname.toLowerCase();
	return (
		accepted.includes(host) || accepted.some((name) => host === `www.${name}`)
	);
}

/**
 * Recognise one of the public list URLs supported by Listio.
 *
 * Query strings and fragments are dropped from the returned `url` so the same
 * list is always recorded under one Source URL, while extra path segments are
 * rejected so an accidentally pasted detail page produces an actionable
 * error before any API request is made.
 */
export function detectSource(input: string): DetectedSource {
	let parsed: URL;
	try {
		parsed = new URL(input.trim());
	} catch {
		throw new SourceDetectionError(
			`Unsupported source URL: “${input}”. Paste a Trakt, MDBList or IMDb list URL.`
		);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new SourceDetectionError(
			`Unsupported source URL protocol “${parsed.protocol}”. Use an http or https list URL.`
		);
	}

	const segments = pathSegments(parsed.pathname);
	parsed.search = '';
	parsed.hash = '';
	const canonicalUrl = parsed.toString();

	if (hostIs(parsed.hostname, 'trakt.tv', 'app.trakt.tv')) {
		// The new web app (app.trakt.tv) appends a view segment, e.g. `/eff`, to
		// list URLs. Both forms are recorded under the classic trakt.tv URL.
		if (
			(segments.length === 4 || segments.length === 5) &&
			segments[0].toLowerCase() === 'users' &&
			segments[2].toLowerCase() === 'lists'
		) {
			return {
				site: 'trakt',
				url: `https://trakt.tv/users/${segments[1]}/lists/${segments[3]}`,
				user: segments[1],
				slug: segments[3],
			};
		}
		if (segments.length === 2 && segments[0].toLowerCase() === 'lists') {
			return {
				site: 'trakt',
				url: `https://trakt.tv/lists/${segments[1]}`,
				listId: segments[1],
			};
		}
	}

	if (
		hostIs(parsed.hostname, 'mdblist.com') &&
		segments.length === 3 &&
		segments[0].toLowerCase() === 'lists'
	) {
		return {
			site: 'mdblist',
			url: canonicalUrl,
			user: segments[1],
			slug: segments[2],
		};
	}

	if (
		hostIs(parsed.hostname, 'imdb.com', 'm.imdb.com') &&
		!parsed.port &&
		!parsed.username &&
		!parsed.password &&
		segments.length === 2 &&
		segments[0] === 'list' &&
		/^ls\d+$/.test(segments[1])
	) {
		return {
			site: 'imdb',
			url: `https://www.imdb.com/list/${segments[1]}/`,
			listId: segments[1],
		};
	}

	throw new SourceDetectionError(
		`Unsupported source URL “${input}”. Expected a Trakt list ` +
			`(trakt.tv/users/{user}/lists/{slug} or trakt.tv/lists/{id}) ` +
			`an MDBList list (mdblist.com/lists/{user}/{slug}), ` +
			`or an IMDb list (imdb.com/list/ls…).`
	);
}

/** A non-throwing form useful for URL validation in a UI. */
export function tryDetectSource(input: string): DetectedSource | null {
	try {
		return detectSource(input);
	} catch (error) {
		if (error instanceof SourceDetectionError) return null;
		throw error;
	}
}
