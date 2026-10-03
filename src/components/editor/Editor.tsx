import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
	CombinedList,
	SourceRecord,
	SourceTitle,
	Title,
} from '../../domain/types.ts';
import { sortTitles } from '../../domain/sort.ts';
import { detectSource } from '../../sources/detect.ts';
import { parseImdbCsv } from '../../sources/imdb.ts';
import {
	addSource,
	applyEnrichment,
	countChanges,
	createDraft,
	removeTitles,
	restoreTitles,
	type Draft,
} from './draft.ts';
import { addTitle } from '../../domain/merge.ts';
import TitleDiscovery from './TitleDiscovery.tsx';
import { api, ApiError } from './api.ts';
import { enrichmentQueue } from './enrichment.ts';

type SourceRow = {
	id: number;
	url: string;
	state: 'idle' | 'fetching' | 'done' | 'error';
	message: string;
	csvFallback?: boolean;
};
type View = 'all' | 'new' | 'removed';
type CardAction = 'remove' | 'restore' | 'toggle';
type CardActionHandler = (
	kind: CardAction,
	id: string,
	checked?: boolean
) => void;
/** Cards rendered per progressive batch (plan §6). */
const BATCH = 60;

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
	const [review, setReview] = useState(
		initialList.titles.length + initialList.removed.length > 0
	);
	const [view, setView] = useState<View>('all');
	const [selection, setSelection] = useState<Set<string>>(() => new Set());
	const [visible, setVisible] = useState(BATCH);
	const sentinel = useRef<HTMLDivElement>(null);
	const [conflict, setConflict] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState(
		created ? 'Refresh the Listio addon in Nuvio to see this change' : ''
	);
	// Lazy initialisers: these run once, not on every enrichment re-render.
	const [requested] = useState(
		() =>
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
	const [schedule] = useState(enrichmentQueue);
	const [controller] = useState(() => ({ current: new AbortController() }));
	const changes = useMemo(() => countChanges(saved, draft), [saved, draft]);
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
		// After a 409 the Draft can't be saved, so Reload shouldn't prompt.
		if ((!changes && !pending) || conflict) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		// <ClientRouter /> navigations (links, Back) skip beforeunload. Cancelling
		// one makes Astro fall back to a full page load, which does trigger it.
		const fullLoad = (event: Event) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		document.addEventListener('astro:before-preparation', fullLoad);
		return () => {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('astro:before-preparation', fullLoad);
		};
	}, [changes, pending, conflict]);
	// KV reads can be cached for up to a minute, so the server may miss a save
	// made in another tab. Tabs in this browser tell each other directly.
	const savedVersion = saved.version;
	useEffect(() => {
		if (typeof BroadcastChannel === 'undefined') return;
		const channel = new BroadcastChannel('listio-saves');
		channel.onmessage = (
			event: MessageEvent<{ id: string; version: number }>
		) => {
			if (event.data.id === saved.id && event.data.version > savedVersion)
				setConflict(true);
		};
		return () => channel.close();
	}, [saved.id, savedVersion]);

	async function fetchSource(id: number, input: string, csv?: File) {
		if (!input.trim() || saving) return;
		let url: string;
		let site: string;
		try {
			const source = detectSource(input);
			url = source.url;
			site = source.site;
			if (csv && (site !== 'imdb' || csv.size > 5 * 1024 * 1024))
				throw new Error('Choose an IMDb CSV export up to 5 MB.');
		} catch (error) {
			rowStatus(id, {
				state: 'error',
				message:
					error instanceof Error ? error.message : 'Unsupported Source URL.',
			});
			return;
		}
		if (requested.has(url)) {
			rowStatus(id, {
				state: 'error',
				message: 'This Source has already been added or is fetching.',
			});
			return;
		}
		requested.add(url);
		rowStatus(id, {
			url,
			state: 'fetching',
			csvFallback: false,
			message: csv ? 'Reading CSV…' : 'Fetching…',
		});
		setPending((n) => n + 1);
		setError('');
		setNotice('');
		try {
			let result: {
				titles: SourceTitle[];
				source: SourceRecord;
				skippedInvalid: number;
			};
			if (csv) {
				const parsed = parseImdbCsv(await csv.text());
				result = {
					...parsed,
					source: {
						url,
						site: 'imdb-csv',
						addedAt: new Date().toISOString(),
						titleCount: parsed.titles.length,
						skippedNoImdb: parsed.skippedNoImdb,
					},
				};
			} else
				result = await api<typeof result>(
					'/api/sources/fetch',
					controller.current.signal,
					{ url }
				);
			if (controller.current.signal.aborted) return;
			const merged = addSource(draftRef.current, result.source, result.titles);
			update(() => merged.draft);
			const { titleCount, skippedNoImdb } = result.source;
			// new + already-in-list + skipped categories add up to the received count.
			const received = titleCount + skippedNoImdb + result.skippedInvalid;
			const message =
				`${received} Titles · ${merged.newTitles.length} new · ${merged.skipped} already in list or removed · ${skippedNoImdb} skipped — no IMDb ID` +
				(result.skippedInvalid
					? ` · ${result.skippedInvalid} skipped — invalid`
					: '');
			rowStatus(id, {
				state: 'done',
				message:
					message + (merged.newTitles.length ? ' · Filling posters…' : ''),
			});
			let failed = false;
			await schedule(merged.newTitles, async (chunk) => {
				try {
					const enriched = await api<{ titles: Title[] }>(
						'/api/titles/enrich',
						controller.current.signal,
						{ titles: chunk }
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
			requested.delete(url);
			if (!controller.current.signal.aborted)
				rowStatus(id, {
					state: 'error',
					csvFallback: site === 'imdb',
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
		if (saving || pending || !changes || conflict) return;
		const noun = changes === 1 ? 'change' : 'changes';
		if (!window.confirm(`Save ${changes} ${noun} to ${saved.name}?`)) return;
		setSaving(true);
		setError('');
		try {
			const current = draftRef.current;
			const list = await api<CombinedList>(
				`/api/lists/${encodeURIComponent(saved.id)}`,
				controller.current.signal,
				{
					version: saved.version,
					sort: current.sort,
					titles: current.titles,
					removed: current.removed,
					sources: current.sources,
				},
				'PUT'
			);
			setSaved(list);
			if (typeof BroadcastChannel !== 'undefined') {
				const channel = new BroadcastChannel('listio-saves');
				channel.postMessage({ id: list.id, version: list.version });
				channel.close();
			}
			update(() => createDraft(list));
			setSelection(new Set());
			setNotice(
				'Saved. Refresh the Listio addon in Nuvio to see new Catalogs. Title updates can take up to a minute.'
			);
		} catch (error) {
			if (error instanceof ApiError && error.status === 409) setConflict(true);
			else
				setError(
					error instanceof Error ? error.message : 'Unable to save this Draft.'
				);
		} finally {
			setSaving(false);
		}
	}
	const newCount = useMemo(
		() => draft.titles.filter((title) => draft.newIds.has(title.imdbId)).length,
		[draft.titles, draft.newIds]
	);
	const titles = useMemo(() => {
		if (!review) return [];
		const shown =
			view === 'removed'
				? draft.removed
				: view === 'new'
					? draft.titles.filter((title) => draft.newIds.has(title.imdbId))
					: draft.titles;
		return sortTitles(shown, draft.sort);
	}, [review, view, draft.titles, draft.removed, draft.newIds, draft.sort]);
	// Where focus goes after a card unmounts: a card id or the grid heading.
	const focusNext = useRef<string | null>(null);
	useEffect(() => {
		const id = focusNext.current;
		if (!id) return;
		focusNext.current = null;
		const element =
			id === 'heading'
				? document.getElementById('review-heading')
				: document.querySelector<HTMLElement>(
						`[data-id="${CSS.escape(id)}"] .card-tools button`
					);
		element?.focus();
	}, [titles]);
	function focusAfter(id: string) {
		const i = titles.findIndex((title) => title.imdbId === id);
		const next = titles[i + 1] ?? titles[i - 1];
		focusNext.current = next ? next.imdbId : 'heading';
	}
	// Re-observing after each batch re-checks a sentinel that is still in view.
	useEffect(() => {
		const element = sentinel.current;
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting))
					setVisible((n) => n + BATCH);
			},
			{ rootMargin: '1200px 0px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [review, visible, titles.length]);
	function remove(ids: string[]) {
		update((draft) => removeTitles(draft, ids));
		setSelection((selection) => {
			if (!ids.some((id) => selection.has(id))) return selection;
			const next = new Set(selection);
			for (const id of ids) next.delete(id);
			return next;
		});
	}
	function toggle(id: string, checked: boolean) {
		setSelection((selection) => {
			const next = new Set(selection);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}
	// Stable across renders so memoised cards only re-render when their own props change.
	const action = useRef<CardActionHandler>(() => {});
	action.current = (kind, id, checked) => {
		if (kind === 'toggle') return toggle(id, checked ?? false);
		focusAfter(id);
		if (kind === 'remove') remove([id]);
		else update((draft) => restoreTitles(draft, [id]));
	};
	const onAction = useCallback<CardActionHandler>(
		(kind, id, checked) => action.current(kind, id, checked),
		[]
	);
	function showView(next: View) {
		if (next === view) return;
		setView(next);
		setVisible(BATCH);
		setSelection(new Set());
	}
	return (
		<div className="editor">
			{notice && (
				<p className="notice" role="status">
					{notice}
				</p>
			)}
			<TitleDiscovery
				draft={draft}
				saving={saving}
				busy={(delta) => setPending((n) => n + delta)}
				add={(title) => {
					const result = addTitle(draftRef.current, title);
					if (result.status !== 'duplicate') {
						update(() => result.draft);
						setReview(true);
					}
					return result.status;
				}}
			/>
			<section className="panel" aria-labelledby="sources-heading">
				<h2 id="sources-heading">Add Sources</h2>
				<p>
					Paste public Trakt, MDBList or IMDb list URLs. Titles stay in your
					Draft until you save.
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
										csvFallback: false,
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
						{row.csvFallback && (
							<div>
								<p>
									Open this list on IMDb while logged in, choose Export, then
									upload the downloaded CSV.
								</p>
								<label htmlFor={`csv-${row.id}`}>
									IMDb CSV export (up to 5 MB)
								</label>
								<input
									id={`csv-${row.id}`}
									type="file"
									accept=".csv,text/csv"
									disabled={saving || row.state === 'fetching'}
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = '';
										if (file) void fetchSource(row.id, row.url, file);
									}}
								/>
							</div>
						)}
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
					{draft.titles.length} Titles · {newCount} new · {changes} unsaved{' '}
					{changes === 1 ? 'change' : 'changes'}
					{pending > 0 ? ' · Finding Titles or filling posters…' : ''}
				</p>
				{!review && (
					<button type="button" onClick={() => setReview(true)}>
						Review List
					</button>
				)}
			</div>
			{conflict && (
				<div className="error conflict" role="alert">
					<p>
						This Combined List changed after you opened it (for example in
						another tab), so this Draft can’t be saved. Reload to get the latest
						version, then redo your changes.
					</p>
					<button type="button" onClick={() => window.location.reload()}>
						Reload
					</button>
				</div>
			)}
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{review && (
				<section aria-labelledby="review-heading">
					<h2 id="review-heading" tabIndex={-1}>
						Review List
					</h2>
					<div className="review-controls">
						<div className="view-tabs" role="group" aria-label="Show">
							<button
								type="button"
								aria-pressed={view === 'all'}
								onClick={() => showView('all')}
							>
								All ({draft.titles.length})
							</button>
							<button
								type="button"
								aria-pressed={view === 'new'}
								onClick={() => showView(view === 'new' ? 'all' : 'new')}
							>
								Show only new ({newCount})
							</button>
							<button
								type="button"
								aria-pressed={view === 'removed'}
								onClick={() => showView('removed')}
							>
								Removed ({draft.removed.length})
							</button>
						</div>
						<label htmlFor="sort">Sort</label>
						<select
							id="sort"
							value={draft.sort}
							disabled={saving}
							onChange={(event) => {
								const sort = event.target.value as Draft['sort'];
								update((draft) => ({ ...draft, sort }));
								setVisible(BATCH);
							}}
						>
							<option value="newest">Newest</option>
							<option value="oldest">Oldest</option>
							<option value="az">A–Z</option>
							<option value="added">Order added</option>
						</select>
					</div>
					{titles.length === 0 ? (
						<p className="empty-state">
							{view === 'removed'
								? 'No Removed Titles.'
								: view === 'new'
									? 'No new Titles in this Draft.'
									: draft.removed.length > 0
										? `All Titles are removed. Restore them from Removed (${draft.removed.length}).`
										: 'No Titles yet. Search for a Title, paste titles, or add a Source URL to start your Draft.'}
						</p>
					) : (
						<ul className="title-grid">
							{titles.slice(0, visible).map((title) => (
								<TitleCard
									key={title.imdbId}
									title={title}
									removedView={view === 'removed'}
									selected={selection.has(title.imdbId)}
									saving={saving}
									onAction={onAction}
								/>
							))}
						</ul>
					)}
					{visible < titles.length && (
						<div ref={sentinel} className="grid-sentinel" aria-hidden="true" />
					)}
				</section>
			)}
			{(selection.size > 0 || changes > 0) && (
				<div className="floating-actions">
					{selection.size > 0 && (
						<button
							type="button"
							className="danger"
							disabled={saving}
							onClick={() => {
								// Focus a nearby remaining card so the page keeps its place.
								const first = titles.findIndex((t) => selection.has(t.imdbId));
								const next =
									titles
										.slice(first + 1)
										.find((t) => !selection.has(t.imdbId)) ??
									titles
										.slice(0, first)
										.reverse()
										.find((t) => !selection.has(t.imdbId));
								focusNext.current = next ? next.imdbId : 'heading';
								remove([...selection]);
							}}
						>
							Remove selected ({selection.size})
						</button>
					)}
					{changes > 0 && (
						<button
							type="button"
							disabled={saving || pending > 0 || conflict}
							onClick={() => void save()}
						>
							{saving ? 'Saving…' : 'Save'}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

const TitleCard = memo(function TitleCard({
	title,
	removedView,
	selected,
	saving,
	onAction,
}: {
	title: Title;
	removedView: boolean;
	selected: boolean;
	saving: boolean;
	onAction: CardActionHandler;
}) {
	const label = `${title.name}${title.year !== null ? ` (${title.year})` : ''}`;
	return (
		<li className="title-card" data-id={title.imdbId}>
			<div className="poster">
				{title.poster ? (
					<img
						src={title.poster}
						alt=""
						width="342"
						height="513"
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div className="poster-placeholder">No poster</div>
				)}
				{title.rating != null && (
					<span
						className="rating"
						aria-label={`TMDB rating ${title.rating.toFixed(1)} out of 10`}
					>
						★ {title.rating.toFixed(1)}
					</span>
				)}
			</div>
			<div className="card-tools">
				{removedView ? (
					<button
						type="button"
						aria-label={`Restore ${label}`}
						disabled={saving}
						onClick={() => onAction('restore', title.imdbId)}
					>
						Restore
					</button>
				) : (
					<>
						<input
							type="checkbox"
							aria-label={`Select ${label}`}
							checked={selected}
							disabled={saving}
							onChange={(event) =>
								onAction('toggle', title.imdbId, event.target.checked)
							}
						/>
						<button
							type="button"
							className="trash"
							aria-label={`Remove ${label}`}
							title="Remove"
							disabled={saving}
							onClick={() => onAction('remove', title.imdbId)}
						>
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
							</svg>
						</button>
					</>
				)}
			</div>
			<h3>{label}</h3>
			{title.blurb && <p title={title.blurb}>{title.blurb}</p>}
		</li>
	);
});
