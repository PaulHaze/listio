import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchLines, MatchStopped } from '../src/client/matchLines.ts';
import {
	lookupCandidate,
	titleFor,
	hasIdentity,
	clearIdentities,
} from '../src/client/titleIdentity.ts';
import { ApiError } from '../src/client/api.ts';
import type { Title } from '../src/domain/types.ts';
import type { Candidate } from '../src/tmdb/search.ts';
const lines = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		line: `Line ${i}`,
		name: `Line ${i}`,
		year: 2000 + i,
	}));
const title = (id: number): Title => ({
	imdbId: `tt${id}`,
	tmdbId: id,
	type: 'movie',
	name: `Title ${id}`,
	year: 2000,
	poster: null,
	blurb: null,
	addedSeq: 0,
});
const candidate = (id: number): Candidate => ({
	tmdbId: id,
	type: 'movie',
	name: `Title ${id}`,
	year: 2000,
	poster: null,
});
const response = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
afterEach(() => {
	vi.unstubAllGlobals();
	clearIdentities();
});
describe('shared match loop', () => {
	it('sends 20-line batches and associates all results and progress with their original lines', async () => {
		const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
			response(
				JSON.parse(init.body as string).lines.map(() => ({
					status: 'none',
					reason: 'No match',
				}))
			)
		);
		vi.stubGlobal('fetch', fetcher);
		const onResult = vi.fn();
		const onProgress = vi.fn();
		const input = lines(43);
		const result = await matchLines(input, new AbortController().signal, {
			onResult,
			onProgress,
		});
		expect(
			fetcher.mock.calls.map(
				([, init]) => JSON.parse(init.body as string).lines.length
			)
		).toEqual([20, 20, 3]);
		expect(result.map((r) => r.line)).toEqual(input);
		expect(onResult.mock.calls.map(([line]) => line)).toEqual(input);
		expect(onProgress.mock.calls.map(([p]) => p.completed)).toEqual([
			0, 20, 20, 40, 40, 43,
		]);
		expect(
			JSON.parse(fetcher.mock.calls[2][1].body as string).lines[0]
		).toEqual({ name: 'Line 40', year: 2040 });
	});
	it('follows lookup continuations before settling each line', async () => {
		const c = candidate(11001);
		const fetcher = vi.fn(async (url: string) =>
			response(
				url.endsWith('match')
					? [
							{ status: 'lookup', candidate: c },
							{ status: 'matched', title: title(11002) },
						]
					: title(c.tmdbId)
			)
		);
		vi.stubGlobal('fetch', fetcher);
		const input = lines(2);
		const onResult = vi.fn();
		const result = await matchLines(input, new AbortController().signal, {
			onResult,
		});
		expect(result.map((r) => r.result)).toEqual([
			{ status: 'matched', title: title(11001) },
			{ status: 'matched', title: title(11002) },
		]);
		expect(onResult.mock.calls[0][0]).toBe(input[0]);
		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'/api/titles/match',
			'/api/titles/lookup',
		]);
	});
	it('retries transient lines once at the end with original line identity', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response([
					{ status: 'none', reason: 'Temporary', retry: true },
					{ status: 'matched', title: title(11003) },
				])
			)
			.mockResolvedValueOnce(
				response([{ status: 'none', reason: 'Still unavailable', retry: true }])
			);
		vi.stubGlobal('fetch', fetcher);
		const input = lines(2);
		const onProgress = vi.fn();
		const result = await matchLines(input, new AbortController().signal, {
			onProgress,
		});
		expect(result.map((r) => r.line)).toEqual([input[1], input[0]]);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetcher.mock.calls[1][1].body).lines).toEqual([
			{ name: input[0].name, year: input[0].year },
		]);
		expect(onProgress.mock.calls.at(-1)?.[0]).toEqual({
			phase: 'Retrying',
			completed: 1,
			total: 1,
		});
	});
	it('retains completed results and callbacks after a fatal later batch failure', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response(
					lines(20).map(() => ({ status: 'matched', title: title(11004) }))
				)
			)
			.mockResolvedValueOnce(response({ error: 'Bad key' }, 502));
		vi.stubGlobal('fetch', fetcher);
		const onResult = vi.fn();
		const error = await matchLines(lines(21), new AbortController().signal, {
			onResult,
		}).catch((e) => e);
		expect(error).toBeInstanceOf(MatchStopped);
		expect(error.message).toBe('Bad key');
		expect(error.completed).toHaveLength(20);
		expect(error.cause).toBeInstanceOf(Error);
		expect(onResult).toHaveBeenCalledTimes(20);
	});
	it('does not count a line as completed when its result callback rejects', async () => {
		vi.stubGlobal('fetch', async () =>
			response(
				lines(2).map((_, i) => ({ status: 'matched', title: title(11010 + i) }))
			)
		);
		const onResult = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Save failed'));
		const error = await matchLines(lines(2), new AbortController().signal, {
			onResult,
		}).catch((e) => e);
		expect(error).toBeInstanceOf(MatchStopped);
		expect(error.message).toBe('Save failed');
		expect(
			error.completed.map((c: { line: { line: string } }) => c.line.line)
		).toEqual(['Line 0']);
	});
	it('aborts outstanding requests and retains additions from the completed batch', async () => {
		const controller = new AbortController();
		let entered!: () => void;
		const second = new Promise<void>((resolve) => (entered = resolve));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response(
					lines(20).map(() => ({ status: 'matched', title: title(11005) }))
				)
			)
			.mockImplementationOnce(
				(_url, init) =>
					new Promise((_resolve, reject) => {
						entered();
						init.signal.addEventListener('abort', () =>
							reject(init.signal.reason)
						);
					})
			);
		vi.stubGlobal('fetch', fetcher);
		const onResult = vi.fn();
		const run = matchLines(lines(41), controller.signal, { onResult }).catch(
			(e) => e
		);
		await second;
		controller.abort();
		const error = await run;
		expect(error).toBeInstanceOf(MatchStopped);
		expect(error.completed).toHaveLength(20);
		expect(onResult).toHaveBeenCalledTimes(20);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('does no client work when already aborted', async () => {
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		const controller = new AbortController();
		controller.abort();
		await expect(
			matchLines(lines(1), controller.signal)
		).rejects.toBeInstanceOf(MatchStopped);
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('preserves a transient lookup candidate for review and maps missing IMDb to no-match', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					response([
						{ status: 'lookup', candidate: candidate(11006) },
						{ status: 'lookup', candidate: candidate(11007) },
					])
				)
				.mockResolvedValueOnce(
					response({ error: 'Temporary lookup failure' }, 503)
				)
				.mockResolvedValueOnce(
					response({ error: "No IMDb ID, can't add" }, 422)
				)
		);
		const result = await matchLines(lines(2), new AbortController().signal);
		expect(result[0].result).toEqual({
			status: 'ambiguous',
			candidates: [candidate(11006)],
			reason: 'Temporary lookup failure',
		});
		expect(result[1].result).toEqual({
			status: 'none',
			reason: "No IMDb ID, can't add",
		});
	});
});
describe('shared candidate identity', () => {
	it('caches successful identities by type and recognizes active or Removed IMDb-only Titles', async () => {
		const c = candidate(12001);
		const fetcher = vi.fn(async () => response(title(c.tmdbId)));
		vi.stubGlobal('fetch', fetcher);
		await lookupCandidate(c, new AbortController().signal);
		await lookupCandidate(c, new AbortController().signal);
		const existing = { ...title(c.tmdbId), imdbId: 'TT12001', tmdbId: null };
		expect(titleFor({ titles: [existing], removed: [] }, c)).toBe(existing);
		expect(titleFor({ titles: [], removed: [existing] }, c)).toBe(existing);
		expect(
			titleFor({ titles: [existing], removed: [] }, { ...c, type: 'series' })
		).toBeUndefined();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('caches missing IMDb but leaves transient failures available for retry', async () => {
		const noId = candidate(12002),
			transient = candidate(12003);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response({ error: "No IMDb ID, can't add" }, 422))
			.mockResolvedValueOnce(response({ error: 'Try again' }, 503))
			.mockResolvedValueOnce(response(title(transient.tmdbId)));
		vi.stubGlobal('fetch', fetcher);
		await expect(
			lookupCandidate(noId, new AbortController().signal)
		).rejects.toBeInstanceOf(ApiError);
		await expect(
			lookupCandidate(noId, new AbortController().signal)
		).rejects.toMatchObject({ status: 422 });
		expect(hasIdentity(noId)).toBe(true);
		await expect(
			lookupCandidate(transient, new AbortController().signal)
		).rejects.toMatchObject({ status: 503 });
		expect(hasIdentity(transient)).toBe(false);
		await expect(
			lookupCandidate(transient, new AbortController().signal)
		).resolves.toEqual(title(transient.tmdbId));
		expect(fetcher).toHaveBeenCalledTimes(3);
	});
});
