import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { savedDraft } from '../../../api/validate.ts';
import {
	apiError,
	json,
	PATCH_ERROR,
	readListPatch,
} from '../../../api/http.ts';
import {
	deleteList,
	getIndex,
	getList,
	putList,
} from '../../../storage/lists.ts';

export const GET: APIRoute = async ({ params }) => {
	const list = params.id ? await getList(env.LISTIO, params.id) : null;
	return list ? json(list) : json({ error: 'Combined List not found.' }, 404);
};

export const PATCH: APIRoute = async ({ request, params }) => {
	const patch = await readListPatch(request);
	if (!patch) return json({ error: PATCH_ERROR }, 400);
	try {
		const list = params.id ? await getList(env.LISTIO, params.id) : null;
		if (!list) return json({ error: 'Combined List not found.' }, 404);
		// Keep the stable id and all editor data, regardless of other input fields.
		return json(await putList(env.LISTIO, { ...list, ...patch }));
	} catch (error) {
		return apiError(error);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		const id = params.id;
		// An interrupted write can leave an index entry without its list, or the
		// reverse; either one is enough to let delete finish the cleanup.
		const exists =
			id &&
			((await getList(env.LISTIO, id)) ||
				(await getIndex(env.LISTIO)).some((entry) => entry.id === id));
		if (!exists) return json({ error: 'Combined List not found.' }, 404);
		await deleteList(env.LISTIO, id);
		return new Response(null, {
			status: 204,
			headers: { 'Cache-Control': 'no-store' },
		});
	} catch (error) {
		return apiError(error);
	}
};

export const PUT: APIRoute = async ({ request, params }) => {
	const body: unknown = await request.json().catch(() => null);
	try {
		const current = params.id ? await getList(env.LISTIO, params.id) : null;
		if (!current) return json({ error: 'Combined List not found.' }, 404);
		const draft = savedDraft(body, current);
		if (!draft)
			return json(
				{
					error: 'Invalid Draft. Check Titles, Sources and sort before saving.',
				},
				400
			);
		return json(await putList(env.LISTIO, draft));
	} catch (error) {
		return apiError(error);
	}
};
