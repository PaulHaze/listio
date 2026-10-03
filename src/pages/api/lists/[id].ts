import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiError, json, readName } from '../../../api/http.ts';
import { deleteList, getList, putList } from '../../../storage/lists.ts';

export const GET: APIRoute = async ({ params }) => {
	const list = params.id ? await getList(env.LISTIO, params.id) : null;
	return list ? json(list) : json({ error: 'Combined List not found.' }, 404);
};

export const PATCH: APIRoute = async ({ request, params }) => {
	const name = await readName(request);
	if (!name) return json({ error: 'Enter a Combined List name.' }, 400);
	try {
		const list = params.id ? await getList(env.LISTIO, params.id) : null;
		if (!list) return json({ error: 'Combined List not found.' }, 404);
		// Keep the stable id and all editor data, regardless of other input fields.
		return json(await putList(env.LISTIO, { ...list, name }));
	} catch (error) {
		return apiError(error);
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		if (!params.id || !(await getList(env.LISTIO, params.id)))
			return json({ error: 'Combined List not found.' }, 404);
		await deleteList(env.LISTIO, params.id);
		return new Response(null, {
			status: 204,
			headers: { 'Cache-Control': 'no-store' },
		});
	} catch (error) {
		return apiError(error);
	}
};
