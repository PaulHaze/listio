import { useEffect, useRef, useState } from 'react';
import type {
	CombinedList,
	SourceRecord,
	SourceTitle,
	Title,
} from '../../domain/types.ts';
import { sortTitles } from '../../domain/sort.ts';
import { detectSource } from '../../sources/detect.ts';
import {
	addSource,
	applyEnrichment,
	createDraft,
	type Draft,
} from './draft.ts';
import { enrichmentQueue } from './enrichment.ts';

type SourceRow = {
	id: number;
	url: string;
	state: 'idle' | 'fetching' | 'done' | 'error';
	message: string;
};
async function api<T>(
	url: string,
	body: unknown,
	signal: AbortSignal,
	method = 'POST'
): Promise<T> {
	const response = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || !data)
		throw new Error(
			(data &&
			typeof data === 'object' &&
			'error' in data &&
			typeof data.error === 'string'
				? data.error
				: '') || 'Unable to complete this request. Please try again.'
		);
	return data as T;
}

export default function Editor({
	initialList,
	created,
}: {
	initialList: CombinedList;
	created: boolean;
}) {
	const [saved, setSaved] = useState(initialList);
	const [draft, setDraft] = useState(() => createDraft(initialList));
	const draftRef = useRef(draft);
	const [rows, setRows] = useState<SourceRow[]>([
		{ id: 0, url: '', state: 'idle', message: '' },
	]);
	const rowId = useRef(1);
	const [pending, setPending] = useState(0);
	const [saving, setSaving] = useState(false);
	const [review, setReview] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState(
		created ? 'Refresh the Listio addon in Nuvio to see this change' : ''
	);
	const requested = useRef(
		new Set(
			initialList.sources.map((source) => {
				try {
					return detectSource(source.url).url;
				} catch {
					return source.url;
				}
			})
		)
	);
	const schedule = useRef(enrichmentQueue());
	const controller = useRef(new AbortController());
	function update(change: (draft: Draft) => Draft) {
		draftRef.current = change(draftRef.current);
		setDraft(draftRef.current);
	}
	function rowStatus(id: number, change: Partial<SourceRow>) {
		setRows((rows) =>
			rows.map((row) => (row.id === id ? { ...row, ...change } : row))
		);
	}
	useEffect(() => {
		controller.current = new AbortController();
		const url = new URL(window.location.href);
		if (url.searchParams.has('created')) {
			url.searchParams.delete('created');
			history.replaceState(history.state, '', url);
		}
		return () => controller.current.abort();
	}, []);
	useEffect(() => {
		if (!draft.changes && !pending) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [draft.changes, pending]);

	async function fetchSource(id: number, input: string) {
		if (!input.trim() || saving) return;
		let url: string;
		try {
			url = detectSource(input).url;
		} catch (error) {
			rowStatus(id, {
				state: 'error',
				message:
					error instanceof Error ? error.message : 'Unsupported Source URL.',
			});
			return;
		}
		if (requested.current.has(url)) {
			rowStatus(id, {
				state: 'error',
				message: 'This Source has already been added or is fetching.',
			});
			return;
		}
		requested.current.add(url);
		rowStatus(id, { url, state: 'fetching', message: 'Fetching…' });
		setPending((n) => n + 1);
		setError('');
		setNotice('');
		try {
			const result = await api<{
				titles: SourceTitle[];
				source: SourceRecord;
				skippedInvalid: number;
			}>('/api/sources/fetch', { url }, controller.current.signal);
			const merged = addSource(draftRef.current, result.source, result.titles);
			update(() => merged.draft);
			const skipped =
				merged.skipped + result.source.skippedNoImdb + result.skippedInvalid;
			const message = `${result.source.titleCount} Titles · ${merged.newTitles.length} new · ${skipped} skipped (${result.source.skippedNoImdb} — no IMDb ID)`;
			rowStatus(id, {
				state: 'done',
				message:
					message + (merged.newTitles.length ? ' · Filling posters…' : ''),
			});
			let failed = false;
			await schedule.current(merged.newTitles, async (chunk) => {
				try {
					const enriched = await api<{ titles: Title[] }>(
						'/api/titles/enrich',
						{ titles: chunk },
						controller.current.signal
					);
					if (!controller.current.signal.aborted)
						update((draft) => applyEnrichment(draft, enriched.titles));
				} catch {
					if (!controller.current.signal.aborted) failed = true;
				}
			});
			if (!controller.current.signal.aborted)
				rowStatus(id, {
					message:
						message +
						(failed
							? ' · Poster enrichment failed; Titles can still be saved.'
							: ''),
				});
		} catch (error) {
			requested.current.delete(url);
			if (!controller.current.signal.aborted)
				rowStatus(id, {
					state: 'error',
					message:
						error instanceof Error
							? error.message
							: 'Unable to fetch this Source.',
				});
		} finally {
			if (!controller.current.signal.aborted) setPending((n) => n - 1);
		}
	}
	async function save() {
		if (saving || pending || !draftRef.current.changes) return;
		if (
			!window.confirm(
				`Save ${draftRef.current.changes} changes to ${saved.name}?`
			)
		)
			return;
		setSaving(true);
		setError('');
		try {
			const current = draftRef.current;
			const list = await api<CombinedList>(
				`/api/lists/${encodeURIComponent(saved.id)}`,
				{
					version: saved.version,
					sort: current.sort,
					titles: current.titles,
					removed: current.removed,
					sources: current.sources,
				},
				controller.current.signal,
				'PUT'
			);
			setSaved(list);
			update(() => createDraft(list));
			setNotice(
				'Saved. Refresh the Listio addon in Nuvio to see new Catalogs. Title updates can take up to a minute.'
			);
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Unable to save this Draft.'
			);
		} finally {
			setSaving(false);
		}
	}
	const titles = sortTitles(draft.titles, draft.sort);
	return (
		<div className="editor">
			{notice && (
				<p className="notice" role="status">
					{notice}
				</p>
			)}
			<section className="panel" aria-labelledby="sources-heading">
				<h2 id="sources-heading">Add Sources</h2>
				<p>
					Paste public Trakt or MDBList list URLs. Titles stay in your Draft
					until you save.
				</p>
				{rows.map((row) => (
					<form
						key={row.id}
						onSubmit={(event) => {
							event.preventDefault();
							void fetchSource(row.id, row.url);
						}}
					>
						<label htmlFor={`source-${row.id}`}>Source URL</label>
						<div className="form-row">
							<input
								id={`source-${row.id}`}
								type="url"
								placeholder="https://trakt.tv/users/…/lists/…"
								value={row.url}
								disabled={
									saving || row.state === 'fetching' || row.state === 'done'
								}
								aria-describedby={`source-status-${row.id}`}
								onChange={(event) =>
									rowStatus(row.id, {
										url: event.target.value,
										state: 'idle',
										message: '',
									})
								}
								onPaste={(event) => {
									const text = event.clipboardData.getData('text').trim();
									if (!text) return;
									event.preventDefault();
									rowStatus(row.id, { url: text });
									void fetchSource(row.id, text);
								}}
							/>
							<button
								type="submit"
								disabled={
									saving ||
									!row.url.trim() ||
									row.state === 'fetching' ||
									row.state === 'done'
								}
							>
								Add Source
							</button>
						</div>
						<p
							id={`source-status-${row.id}`}
							className={row.state === 'error' ? 'error' : 'source-status'}
							role={row.state === 'error' ? 'alert' : 'status'}
						>
							{row.message}
						</p>
					</form>
				))}
				<button
					type="button"
					className="add-source"
					aria-label="Add another Source URL"
					disabled={saving}
					onClick={() =>
						setRows((rows) => [
							...rows,
							{ id: rowId.current++, url: '', state: 'idle', message: '' },
						])
					}
				>
					+
				</button>
				{draft.sources.length > 0 && (
					<details className="source-history">
						<summary>Added Sources ({draft.sources.length})</summary>
						<ul>
							{draft.sources.map((source, i) => (
								<li key={`${source.url}-${i}`}>
									<a href={source.url} target="_blank" rel="noreferrer">
										{source.url}
									</a>{' '}
									· {source.titleCount} Titles · {source.skippedNoImdb} skipped
									— no IMDb ID
								</li>
							))}
						</ul>
					</details>
				)}
			</section>
			<div className="editor-actions">
				<p role="status">
					{draft.titles.length} Titles · {draft.newIds.size} new ·{' '}
					{draft.changes} unsaved changes
					{pending > 0 ? ' · Fetching Sources or filling posters…' : ''}
				</p>
				<button type="button" onClick={() => setReview(true)}>
					Review List
				</button>
				{draft.changes > 0 && (
					<button
						type="button"
						disabled={saving || pending > 0}
						onClick={() => void save()}
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
				)}
			</div>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{review && (
				<section aria-labelledby="review-heading">
					<h2 id="review-heading">Review List</h2>
					<label htmlFor="sort">Sort</label>
					<select
						id="sort"
						value={draft.sort}
						disabled={saving}
						onChange={(event) => {
							const sort = event.target.value as Draft['sort'];
							update((draft) => ({
								...draft,
								sort,
								changes: draft.changes + 1,
							}));
						}}
					>
						<option value="newest">Newest</option>
						<option value="oldest">Oldest</option>
						<option value="az">A–Z</option>
						<option value="added">Order added</option>
					</select>
					{titles.length === 0 ? (
						<p className="empty-state">
							No Titles yet. Add a Source to start your Draft.
						</p>
					) : (
						<ul className="title-grid">
							{titles.map((title) => (
								<li key={title.imdbId} className="title-card">
									{title.poster ? (
										<img
											src={title.poster}
											alt=""
											width="185"
											height="278"
											loading="lazy"
										/>
									) : (
										<div className="poster-placeholder">No poster</div>
									)}
									<h3>
										{title.name}
										{title.year !== null ? ` (${title.year})` : ''}
									</h3>
									{title.blurb && <p title={title.blurb}>{title.blurb}</p>}
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</div>
	);
}
