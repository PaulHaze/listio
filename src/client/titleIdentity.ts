import type { Title } from '../domain/types.ts';
import type { Candidate } from '../tmdb/search.ts';
import { api, ApiError } from './api.ts';

export type CurrentTitles = {
	titles: Title[];
	removed: Title[];
	newIds?: ReadonlySet<string>;
};
/** TMDB result → looked-up Title (null: no IMDb ID), shared across searches. */
const identities = new Map<string, Title | null>();
export const candidateKey = (c: Candidate) => `${c.type}-${c.tmdbId}`;
export const sameId = (a: string, b: string | undefined) =>
	!!b && a.toLowerCase() === b.toLowerCase();
/** A current active or Removed Title that is this TMDB result. */
export function titleFor(
	current: CurrentTitles,
	candidate: Candidate
): Title | undefined {
	const imdbId = identities.get(candidateKey(candidate))?.imdbId;
	const same = (title: Title) =>
		sameId(title.imdbId, imdbId) ||
		(title.tmdbId === candidate.tmdbId && title.type === candidate.type);
	return current.titles.find(same) ?? current.removed.find(same);
}
export async function lookupCandidate(
	candidate: Candidate,
	signal: AbortSignal
): Promise<Title> {
	const key = candidateKey(candidate);
	const cached = identities.get(key);
	signal.throwIfAborted();
	if (cached) return cached;
	if (cached === null) throw new ApiError("No IMDb ID, can't add", 422);
	try {
		const title = await api<Title>('/api/titles/lookup', signal, candidate);
		signal.throwIfAborted();
		identities.set(key, title);
		return title;
	} catch (error) {
		if (error instanceof ApiError && error.status === 422)
			identities.set(key, null);
		throw error;
	}
}

export const hasIdentity = (candidate: Candidate) =>
	identities.has(candidateKey(candidate));
/** Test isolation only: forget every cached identity. */
export const clearIdentities = () => identities.clear();
