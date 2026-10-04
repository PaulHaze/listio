import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiError, json, NAME_ERROR, readName } from '../../../api/http.ts';
import { isRecord } from '../../../api/validate.ts';
import { uniqueSlug } from '../../../domain/slug.ts';
import {
	createImportList,
	getIndex,
	getList,
	putList,
} from '../../../storage/lists.ts';

export const GET: APIRoute = async () => {
	try {
		return json(await getIndex(env.LISTIO));
	} catch (error) {
		return apiError(error);
	}
};

export const POST: APIRoute = async ({ request }) => {
	const name = await readName(request.clone());
	if (!name) return json({ error: NAME_ERROR }, 400);
	try {
		const body = await request.json();
		if (isRecord(body) && 'creationId' in body) {
			if (
				typeof body.creationId !== 'string' ||
				!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
					body.creationId
				)
			)
				return json({ error: 'Invalid import creation identifier.' }, 400);
			return json(
				await createImportList(env.LISTIO, name, body.creationId),
				201
			);
		}
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
