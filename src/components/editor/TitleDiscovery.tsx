import { useEffect, useRef, useState } from 'react';
import type { Title } from '../../domain/types.ts';
import { pasteLines, type PasteLine } from '../../domain/pasteLines.ts';
import type { Candidate } from '../../tmdb/search.ts';
import type { BatchMatchResult, MatchResult } from '../../tmdb/match.ts';
import type { Draft } from './draft.ts';

class RequestError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}
async function request<T>(
	url: string,
	signal: AbortSignal,
	body?: unknown
): Promise<T> {
	const response = await fetch(url, {
		signal,
		...(body === undefined
			? {}
			: {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				}),
	});
	const data = await response.json();
	if (!response.ok)
		throw new RequestError(
			data &&
				typeof data === 'object' &&
				'error' in data &&
				typeof data.error === 'string'
				? data.error
				: 'Unable to find Titles. Please try again.',
			response.status
		);
	return data as T;
}
type ReviewLine = PasteLine & { result: MatchResult; resolved: boolean };
export default function TitleDiscovery({
	draft,
	saving,
	add,
	busy,
}: {
	draft: Draft;
	saving: boolean;
	add: (title: Title) => 'added' | 'duplicate' | 'restored';
	busy: (delta: number) => void;
}) {
	const [text, setText] = useState('');
	const [matching, setMatching] = useState(false);
	const [progress, setProgress] = useState('');
	const [summary, setSummary] = useState<{
		added: number;
		duplicate: number;
	} | null>(null);
	const [review, setReview] = useState<ReviewLine[]>([]);
	const [error, setError] = useState('');
	const controller = useRef<AbortController | null>(null);
	useEffect(() => {
		controller.current = new AbortController();
		return () => controller.current?.abort();
	}, []);
	const signal = () => controller.current!.signal;
	async function find() {
		const lines = pasteLines(text);
		if (!lines.length || matching || saving) return;
		setMatching(true);
		busy(1);
		setError('');
		setReview([]);
		setSummary(null);
		let added = 0,
			duplicate = 0;
		const unresolved: ReviewLine[] = [];
		try {
			for (let offset = 0; offset < lines.length; offset += 20) {
				setProgress(`Matching ${offset} / ${lines.length}…`);
				const batch = lines.slice(offset, offset + 20);
				const results = await request<BatchMatchResult[]>(
					'/api/titles/match',
					signal(),
					{ lines: batch.map(({ name, year }) => ({ name, year })) }
				);
				for (const [i, initial] of results.entries()) {
					let result: MatchResult;
					if (initial.status === 'lookup') {
						try {
							result = {
								status: 'matched',
								title: await request<Title>(
									'/api/titles/lookup',
									signal(),
									initial.candidate
								),
							};
						} catch (error) {
							if (signal().aborted) throw error;
							// Preserve the candidate for retry if lookup failed transiently.
							result =
								error instanceof RequestError && error.status === 422
									? { status: 'none', reason: error.message }
									: {
											status: 'ambiguous',
											candidates: [initial.candidate],
											reason:
												error instanceof Error
													? error.message
													: 'Unable to look up this Title.',
										};
						}
					} else result = initial;
					if (result.status === 'matched') {
						if (add(result.title) === 'duplicate') duplicate++;
						else added++;
					} else unresolved.push({ ...batch[i], result, resolved: false });
				}
				setProgress(
					`Matching ${Math.min(offset + 20, lines.length)} / ${lines.length}…`
				);
				setReview([...unresolved]);
				setSummary({ added, duplicate });
			}
			setProgress('');
		} catch (error) {
			if (!signal().aborted) {
				setError(
					error instanceof Error ? error.message : 'Unable to match Titles.'
				);
				setReview([...unresolved]);
				setSummary({ added, duplicate });
				setProgress(
					'Matching stopped. Completed batches remain in your Draft; retry the pasted lines safely.'
				);
			}
		} finally {
			if (!signal().aborted) {
				setMatching(false);
				busy(-1);
			}
		}
	}
	function resolve(index: number, status?: 'added' | 'duplicate' | 'restored') {
		setReview((rows) =>
			rows.map((row, i) => (i === index ? { ...row, resolved: true } : row))
		);
		if (status)
			setSummary(
				(value) =>
					value && {
						...value,
						[status === 'duplicate' ? 'duplicate' : 'added']:
							value[status === 'duplicate' ? 'duplicate' : 'added'] + 1,
					}
			);
	}
	return (
		<div className="discovery-panels">
			<section className="panel" aria-labelledby="search-heading">
				<h2 id="search-heading">Search Titles</h2>
				<p>
					Find Movies and Series to add to your Draft. Only Save publishes to
					Nuvio.
				</p>
				<Search draft={draft} disabled={saving} add={add} busy={busy} />
			</section>
			<section className="panel" aria-labelledby="paste-heading">
				<h2 id="paste-heading">Paste titles</h2>
				<label htmlFor="paste-titles">
					One Title per line, optionally with a year (1999)
				</label>
				<textarea
					id="paste-titles"
					rows={8}
					value={text}
					disabled={saving || matching}
					onChange={(event) => setText(event.target.value)}
				/>
				<button
					type="button"
					disabled={saving || matching || !pasteLines(text).length}
					onClick={() => void find()}
				>
					Find titles
				</button>
				<p role="status">{progress}</p>
				{summary && (
					<p role="status">
						{summary.added} added · {summary.duplicate} already in list ·{' '}
						{review.filter((row) => !row.resolved).length} need a look
					</p>
				)}
				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
				{review.some((row) => !row.resolved) && <h3>Need a look</h3>}
				{review.map((row, index) =>
					row.resolved ? null : (
						<div className="match-review" key={`${row.line}-${index}`}>
							<h4>{row.line}</h4>
							{row.result.status === 'none' ? (
								<>
									<p>
										No match
										{row.result.reason !== 'No match'
											? ` · ${row.result.reason}`
											: ''}
									</p>
									<Search
										initialQuery={row.name}
										draft={draft}
										disabled={saving || matching}
										add={add}
										busy={busy}
										onAdded={(status) => resolve(index, status)}
									/>
								</>
							) : row.result.status === 'ambiguous' ? (
								<>
									{row.result.reason && (
										<p>
											No match
											{row.result.reason !== 'No match'
												? ` · ${row.result.reason}`
												: ''}
										</p>
									)}
									<Candidates
										candidates={row.result.candidates}
										draft={draft}
										disabled={saving || matching}
										add={add}
										busy={busy}
										onAdded={(status) => resolve(index, status)}
									/>
								</>
							) : null}
							<button
								type="button"
								disabled={matching || saving}
								onClick={() => resolve(index)}
							>
								Skip
							</button>
						</div>
					)
				)}
			</section>
		</div>
	);
}
function Search({
	initialQuery = '',
	draft,
	disabled,
	add,
	busy,
	onAdded,
}: {
	initialQuery?: string;
	draft: Draft;
	disabled: boolean;
	add: (title: Title) => 'added' | 'duplicate' | 'restored';
	busy: (delta: number) => void;
	onAdded?: (status: 'added' | 'duplicate' | 'restored') => void;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [results, setResults] = useState<Candidate[]>([]);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	useEffect(() => {
		const controller = new AbortController();
		setResults([]);
		setError('');
		setMessage('');
		if (query.trim().length < 2) return () => controller.abort();
		const timer = setTimeout(() => {
			setMessage('Searching…');
			void request<Candidate[]>(
				`/api/search?q=${encodeURIComponent(query.trim())}`,
				controller.signal
			)
				.then((results) => {
					setResults(results);
					setMessage(results.length ? '' : 'No match');
				})
				.catch((error) => {
					if (!controller.signal.aborted) {
						setMessage('');
						setError(error.message);
					}
				});
		}, 300);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [query]);
	return (
		<>
			<label>
				Search Movies and Series
				<input
					type="search"
					value={query}
					disabled={disabled}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			<p role="status">{message}</p>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			<Candidates
				candidates={results}
				draft={draft}
				disabled={disabled}
				add={add}
				busy={busy}
				onAdded={onAdded}
			/>
		</>
	);
}
function Candidates({
	candidates,
	draft,
	disabled,
	add,
	busy,
	onAdded,
}: {
	candidates: Candidate[];
	draft: Draft;
	disabled: boolean;
	add: (title: Title) => 'added' | 'duplicate' | 'restored';
	busy: (delta: number) => void;
	onAdded?: (status: 'added' | 'duplicate' | 'restored') => void;
}) {
	const [pending, setPending] = useState<Set<string>>(new Set());
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [identities, setIdentities] = useState<Record<string, string>>({});
	const controller = useRef<AbortController | null>(null);
	const inFlight = useRef(new Set<string>());
	useEffect(() => {
		controller.current = new AbortController();
		return () => controller.current?.abort();
	}, []);
	async function lookup(candidate: Candidate) {
		const key = `${candidate.type}-${candidate.tmdbId}`;
		if (disabled || inFlight.current.has(key)) return;
		inFlight.current.add(key);
		setPending(new Set(inFlight.current));
		busy(1);
		setErrors((errors) => ({ ...errors, [key]: '' }));
		try {
			const title = await request<Title>(
				'/api/titles/lookup',
				controller.current!.signal,
				candidate
			);
			setIdentities((ids) => ({ ...ids, [key]: title.imdbId }));
			const status = add(title);
			onAdded?.(status);
		} catch (error) {
			if (!controller.current!.signal.aborted)
				setErrors((errors) => ({
					...errors,
					[key]:
						error instanceof Error
							? error.message
							: 'Unable to add this Title.',
				}));
		} finally {
			inFlight.current.delete(key);
			busy(-1);
			if (!controller.current!.signal.aborted)
				setPending(new Set(inFlight.current));
		}
	}
	return (
		<ul className="title-grid search-grid">
			{candidates.map((candidate) => {
				const key = `${candidate.type}-${candidate.tmdbId}`;
				const same = (title: Title) =>
					title.imdbId === identities[key] ||
					(title.tmdbId === candidate.tmdbId && title.type === candidate.type);
				const active = draft.titles.find(same);
				const removed = draft.removed.some(same);
				const label = active
					? draft.newIds.has(active.imdbId)
						? '✓ Added'
						: 'In list'
					: removed
						? 'Restore'
						: 'Add';
				return (
					<li className="title-card" key={key}>
						<div className="poster">
							{candidate.poster ? (
								<img
									src={candidate.poster}
									alt=""
									width={185}
									height={278}
									loading="lazy"
								/>
							) : (
								<div className="poster-placeholder">No poster</div>
							)}
						</div>
						<h3>
							{candidate.name}
							{candidate.year !== null ? ` (${candidate.year})` : ''}
						</h3>
						<span className="media-badge">
							{candidate.type === 'movie' ? 'Movie' : 'Series'}
						</span>
						<button
							type="button"
							disabled={disabled || !!active || pending.has(key)}
							onClick={() => void lookup(candidate)}
						>
							{pending.has(key) ? 'Adding…' : label}
						</button>
						{errors[key] && (
							<p className="error" role="alert">
								{errors[key]}
							</p>
						)}
					</li>
				);
			})}
		</ul>
	);
}
