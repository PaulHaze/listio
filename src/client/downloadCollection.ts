import { collectionFilename } from '../domain/nuvioCollection.ts';

/** Download only on a user action; release the browser URL after the click. */
export function downloadCollection(data: unknown, name: string) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(data, null, 2) + '\n'], {
			type: 'application/json',
		})
	);
	const link = document.createElement('a');
	try {
		link.href = url;
		link.download = collectionFilename(name);
		document.body.appendChild(link);
		link.click();
	} finally {
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}
