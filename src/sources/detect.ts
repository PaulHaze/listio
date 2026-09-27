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

export type DetectedSource = TraktDetectedSource | MdbListDetectedSource;

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
 * Query strings and fragments are ignored, while extra path segments are
 * rejected so an accidentally pasted detail page produces an actionable
 * error before any API request is made.
 */
export function detectSource(input: string): DetectedSource {
	let parsed: URL;
	try {
		parsed = new URL(input.trim());
	} catch {
		throw new SourceDetectionError(
			`Unsupported source URL: “${input}”. Paste a Trakt or MDBList list URL.`
		);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new SourceDetectionError(
			`Unsupported source URL protocol “${parsed.protocol}”. Use an http or https list URL.`
		);
	}

	const segments = pathSegments(parsed.pathname);
	const canonicalUrl = parsed.toString();

	if (hostIs(parsed.hostname, 'trakt.tv')) {
		if (
			segments.length === 4 &&
			segments[0].toLowerCase() === 'users' &&
			segments[2].toLowerCase() === 'lists'
		) {
			return {
				site: 'trakt',
				url: canonicalUrl,
				user: segments[1],
				slug: segments[3],
			};
		}
		if (segments.length === 2 && segments[0].toLowerCase() === 'lists') {
			return {
				site: 'trakt',
				url: canonicalUrl,
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

	throw new SourceDetectionError(
		`Unsupported source URL “${input}”. Expected a Trakt list ` +
			`(trakt.tv/users/{user}/lists/{slug} or trakt.tv/lists/{id}) ` +
			`or an MDBList list (mdblist.com/lists/{user}/{slug}).`
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

export const parseSourceUrl = detectSource;
