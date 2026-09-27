import { detectSource } from '../src/sources/detect.ts';
import { fetchMdbList } from '../src/sources/mdblist.ts';
import {
	enrichSourceTitles,
	printProbeResult,
	readDevVars,
	requiredValue,
} from './probe-utils.ts';

const url = process.argv[2];
if (!url) {
	console.error(
		'Usage: pnpm probe:mdblist https://mdblist.com/lists/{user}/{slug}'
	);
	process.exitCode = 1;
} else {
	try {
		const source = detectSource(url);
		if (source.site !== 'mdblist')
			throw new Error('The supplied URL is not an MDBList list.');
		const vars = readDevVars();
		const result = await fetchMdbList(
			source,
			requiredValue('MDBLIST_API_KEY', vars)
		);
		const titles = await enrichSourceTitles(
			result.titles,
			requiredValue('TMDB_API_KEY', vars)
		);
		printProbeResult('mdblist', url, titles, result);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
