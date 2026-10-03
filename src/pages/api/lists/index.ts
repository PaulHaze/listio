import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiError, json, readName } from '../../../api/http.ts';
import { uniqueSlug } from '../../../domain/slug.ts';
import { getIndex, getList, putList } from '../../../storage/lists.ts';

export const POST: APIRoute = async ({ request }) => {
	const name = await readName(request);
	if (!name) return json({ error: 'Enter a Combined List name.' }, 400);
	try {
		const taken = new Set((await getIndex(env.LISTIO)).map((list) => list.id));
		let id = uniqueSlug(name, taken);
		// A list may exist without an index entry after an interrupted write.
		while (await getList(env.LISTIO, id)) {
			taken.add(id);
			id = uniqueSlug(name, taken);
		}
		const saved = await putList(env.LISTIO, {
			id,
			name,
			sort: 'newest',
			sources: [],
			titles: [],
			removed: [],
			nextSeq: 0,
			version: 0,
			updatedAt: '',
		});
		return json(saved, 201);
	} catch (error) {
		return apiError(error);
	}
};
