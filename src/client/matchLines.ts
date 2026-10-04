import type { PasteLine } from '../domain/pasteLines.ts';
import type { BatchMatchResult, MatchResult } from '../tmdb/match.ts';
import { api, ApiError } from './api.ts';
import { lookupCandidate } from './titleIdentity.ts';

export type CompletedMatch = { line: PasteLine; result: MatchResult };
export type MatchProgress = {
	phase: 'Matching' | 'Retrying';
	completed: number;
	total: number;
};
/** Lines whose onResult settled, even when a later request fails or is aborted. */
export class MatchStopped extends Error {
	constructor(
		readonly completed: CompletedMatch[],
		cause: unknown
	) {
		super(cause instanceof Error ? cause.message : 'Unable to match Titles.', {
			cause,
		});
	}
}

/** Shared client orchestration; callers decide what to do with each settled Title. */
export async function matchLines(
	lines: PasteLine[],
	signal: AbortSignal,
	callbacks: {
		onProgress?: (progress: MatchProgress) => void;
		onResult?: (line: PasteLine, result: MatchResult) => void | Promise<void>;
	} = {}
): Promise<CompletedMatch[]> {
	const completed: CompletedMatch[] = [];
	async function run(input: PasteLine[], phase: MatchProgress['phase']) {
		const failed: PasteLine[] = [];
		for (let offset = 0; offset < input.length; offset += 20) {
			signal.throwIfAborted();
			callbacks.onProgress?.({ phase, completed: offset, total: input.length });
			const batch = input.slice(offset, offset + 20);
			const results = await api<BatchMatchResult[]>(
				'/api/titles/match',
				signal,
				{
					lines: batch.map(({ name, year }) => ({ name, year })),
				}
			);
			signal.throwIfAborted();
			if (results.length !== batch.length)
				throw new Error('Incomplete title match response. Please try again.');
			for (const [index, initial] of results.entries()) {
				signal.throwIfAborted();
				let result: MatchResult;
				if (initial.status === 'lookup') {
					try {
						result = {
							status: 'matched',
							title: await lookupCandidate(initial.candidate, signal),
						};
					} catch (error) {
						signal.throwIfAborted();
						// Preserve the candidate for review if lookup failed transiently.
						result =
							error instanceof ApiError && error.status === 422
								? { status: 'none', reason: error.message }
								: {
										status: 'ambiguous',
										candidates: [initial.candidate],
										reason:
											error instanceof Error
												? error.message
												: 'Unable to look up this Title.',
									};
					}
				} else result = initial;
				signal.throwIfAborted();
				const line = batch[index];
				// Lines that hit a transient TMDB error get one more try at the end.
				if (result.status === 'none' && result.retry && phase === 'Matching') {
					failed.push(line);
					continue;
				}
				// Settled only once the caller has accepted the result.
				await callbacks.onResult?.(line, result);
				completed.push({ line, result });
			}
			signal.throwIfAborted();
			callbacks.onProgress?.({
				phase,
				completed: Math.min(offset + 20, input.length),
				total: input.length,
			});
		}
		return failed;
	}
	try {
		const failed = await run(lines, 'Matching');
		if (failed.length) await run(failed, 'Retrying');
		return completed;
	} catch (error) {
		throw new MatchStopped(completed, error);
	}
}
