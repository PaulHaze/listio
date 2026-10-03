import type { Title } from '../../domain/types.ts';

// Leave headroom below the Worker's 50 external subrequests. /find + details
// costs two calls when the Source did not provide a TMDB ID.
export const MAX_ENRICH_REQUESTS = 40;
export const enrichmentCost = (title: Title): number =>
	title.tmdbId === null ? 2 : 1;
export function enrichmentChunks(titles: readonly Title[]): Title[][] {
	const chunks: Title[][] = [];
	let chunk: Title[] = [],
		cost = 0;
	for (const title of titles) {
		const next = enrichmentCost(title);
		if (cost + next > MAX_ENRICH_REQUESTS || chunk.length === 40) {
			chunks.push(chunk);
			chunk = [];
			cost = 0;
		}
		chunk.push(title);
		cost += next;
	}
	if (chunk.length) chunks.push(chunk);
	return chunks;
}

/** One queue for the whole editor, including simultaneously added Sources. */
export function enrichmentQueue() {
	let running = 0;
	const queue: (() => Promise<void>)[] = [];
	function pump() {
		while (running < 3 && queue.length) {
			const task = queue.shift()!;
			running += 1;
			void task().finally(() => {
				running -= 1;
				pump();
			});
		}
	}
	return (titles: readonly Title[], run: (chunk: Title[]) => Promise<void>) =>
		Promise.all(
			enrichmentChunks(titles).map(
				(chunk) =>
					new Promise<void>((resolve, reject) => {
						queue.push(async () => {
							try {
								await run(chunk);
								resolve();
							} catch (error) {
								reject(error);
							}
						});
						pump();
					})
			)
		);
}
