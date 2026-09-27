import { detectSource } from '../src/sources/detect.ts';
import { fetchTrakt } from '../src/sources/trakt.ts';
import {
	enrichSourceTitles,
	printProbeResult,
	readDevVars,
	requiredValue,
} from './probe-utils.ts';

const url = process.argv[2];
if (!url) {
	console.error(
		'Usage: pnpm probe:trakt https://trakt.tv/users/{user}/lists/{slug}'
	);
	process.exitCode = 1;
} else {
	try {
		const source = detectSource(url);
		if (source.site !== 'trakt')
			throw new Error('The supplied URL is not a Trakt list.');
		const vars = readDevVars();
		const result = await fetchTrakt(
			source,
			requiredValue('TRAKT_CLIENT_ID', vars)
		);
		const titles = await enrichSourceTitles(
			result.titles,
			requiredValue('TMDB_API_KEY', vars)
		);
		printProbeResult('trakt', url, titles, result.skippedNoImdb);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
