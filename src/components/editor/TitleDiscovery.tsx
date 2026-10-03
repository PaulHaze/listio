import { useEffect, useRef, useState } from 'react';
import type { Title } from '../../domain/types.ts';
import { pasteLines, type PasteLine } from '../../domain/pasteLines.ts';
import type { Candidate } from '../../tmdb/search.ts';
import type { BatchMatchResult, MatchResult } from '../../tmdb/match.ts';
import type { Draft } from './draft.ts';
import { api, ApiError } from './api.ts';

/** TMDB result → looked-up Title (null: no IMDb ID), shared across searches. */
const identities = new Map<string, Title | null>();
const candidateKey = (c: Candidate) => `${c.type}-${c.tmdbId}`;
const sameId = (a: string, b: string | undefined) =>
	!!b && a.toLowerCase() === b.toLowerCase();
/** A Draft Title (active or Removed) that is this TMDB result. */
function draftTitleFor(draft: Draft, candidate: Candidate): Title | undefined {
	const imdbId = identities.get(candidateKey(candidate))?.imdbId;
	const same = (title: Title) =>
		sameId(title.imdbId, imdbId) ||
		(title.tmdbId === candidate.tmdbId && title.type === candidate.type);
	return draft.titles.find(same) ?? draft.removed.find(same);
}
async function lookupCandidate(
	candidate: Candidate,
	signal: AbortSignal
): Promise<Title> {
	const key = candidateKey(candidate);
	const cached = identities.get(key);
	if (cached) return cached;
	try {
		const title = await api<Title>('/api/titles/lookup', signal, candidate);
		identities.set(key, title);
		return title;
	} catch (error) {
		if (error instanceof ApiError && error.status === 422)
			identities.set(key, null);
		throw error;
	}
}
type ReviewLine = PasteLine & { result: MatchResult; resolved: boolean };
type AddStatus = 'added' | 'duplicate' | 'restored';
const lineKey = (line: PasteLine) => line.line.trim().toLowerCase();
export default function TitleDiscovery({
	draft,
	saving,
	add,
	busy,
}: {
	draft: Draft;
	saving: boolean;
	add: (title: Title) => AddStatus;
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
	const draftRef = useRef(draft);
	draftRef.current = draft;
	// Pasted line → IMDb ID chosen in Need a look, reused on a repeat paste.
	const resolutions = useRef(new Map<string, string>());
	useEffect(() => {
		controller.current = new AbortController();
		return () => controller.current?.abort();
	}, []);
	const signal = () => controller.current!.signal;
	/** A Draft Title this line was already resolved to, if any. */
	function known(line: PasteLine, result: MatchResult): Title | undefined {
		const current = draftRef.current;
		const chosen = resolutions.current.get(lineKey(line));
		const byChoice =
			chosen &&
			[...current.titles, ...current.removed].find((t) =>
				sameId(t.imdbId, chosen)
			);
		if (byChoice) return byChoice;
		if (result.status === 'ambiguous')
			for (const candidate of result.candidates) {
				const title = draftTitleFor(current, candidate);
				if (title) return title;
			}
	}
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
		const settle = async (batch: PasteLine[], results: BatchMatchResult[]) => {
			const failed: PasteLine[] = [];
			for (const [i, initial] of results.entries()) {
				let result: MatchResult;
				if (initial.status === 'lookup') {
					try {
						result = {
							status: 'matched',
							title: await lookupCandidate(initial.candidate, signal()),
						};
					} catch (error) {
						if (signal().aborted) throw error;
						// Preserve the candidate for retry if lookup failed transiently.
						result =
							error instanceof ApiError && error.status === 422
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
				if (result.status === 'none' && result.retry && retrying === false) {
					failed.push(batch[i]);
					continue;
				}
				const title =
					result.status === 'matched' ? result.title : known(batch[i], result);
				if (title) {
					if (add(title) === 'duplicate') duplicate++;
					else added++;
				} else unresolved.push({ ...batch[i], result, resolved: false });
			}
			return failed;
		};
		const run = async (lines: PasteLine[], label: string) => {
			const failed: PasteLine[] = [];
			for (let offset = 0; offset < lines.length; offset += 20) {
				setProgress(`${label} ${offset} / ${lines.length}…`);
				const batch = lines.slice(offset, offset + 20);
				const results = await api<BatchMatchResult[]>(
					'/api/titles/match',
					signal(),
					{ lines: batch.map(({ name, year }) => ({ name, year })) }
				);
				failed.push(...(await settle(batch, results)));
				setProgress(
					`${label} ${Math.min(offset + 20, lines.length)} / ${lines.length}…`
				);
				setReview([...unresolved]);
				setSummary({ added, duplicate });
			}
			return failed;
		};
		let retrying = false;
		try {
			const failed = await run(lines, 'Matching');
			// Lines that hit a transient TMDB error get one more try at the end.
			if (failed.length) {
				retrying = true;
				await run(failed, 'Retrying');
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
	function resolve(index: number, status?: AddStatus, title?: Title) {
		if (title) resolutions.current.set(lineKey(review[index]), title.imdbId);
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
										onAdded={(status, title) => resolve(index, status, title)}
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
										onAdded={(status, title) => resolve(index, status, title)}
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
	add: (title: Title) => AddStatus;
	busy: (delta: number) => void;
	onAdded?: (status: AddStatus, title: Title) => void;
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
			void api<Candidate[]>(
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
	add: (title: Title) => AddStatus;
	busy: (delta: number) => void;
	onAdded?: (status: AddStatus, title: Title) => void;
}) {
	const [pending, setPending] = useState<Set<string>>(new Set());
	const [errors, setErrors] = useState<Record<string, string>>({});
	// Re-render once background identity lookups land in the shared cache.
	const [, setResolved] = useState(0);
	const controller = useRef<AbortController | null>(null);
	const inFlight = useRef(new Set<string>());
	useEffect(() => {
		controller.current = new AbortController();
		return () => controller.current?.abort();
	}, []);
	// Draft Titles without a TMDB ID can only be recognised by IMDb ID, so look
	// up results of those types that don't already match by TMDB ID.
	const missingTypes = new Set(
		[...draft.titles, ...draft.removed]
			.filter((title) => title.tmdbId === null)
			.map((title) => title.type)
	);
	const unidentified = candidates.filter(
		(candidate) =>
			missingTypes.has(candidate.type) &&
			!identities.has(candidateKey(candidate)) &&
			!draftTitleFor(draft, candidate)
	);
	const unidentifiedKey = unidentified.map(candidateKey).join(',');
	useEffect(() => {
		if (!unidentified.length) return;
		const signal = controller.current!.signal;
		void (async () => {
			for (const candidate of unidentified) {
				if (signal.aborted) return;
				// Failures are left uncached; Add retries the lookup.
				await lookupCandidate(candidate, signal).catch(() => null);
				if (!signal.aborted) setResolved((n) => n + 1);
			}
		})();
	}, [unidentifiedKey]);
	async function lookup(candidate: Candidate) {
		const key = candidateKey(candidate);
		if (disabled || inFlight.current.has(key)) return;
		inFlight.current.add(key);
		setPending(new Set(inFlight.current));
		busy(1);
		setErrors((errors) => ({ ...errors, [key]: '' }));
		try {
			const title = await lookupCandidate(
				candidate,
				controller.current!.signal
			);
			const status = add(title);
			onAdded?.(status, title);
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
				const key = candidateKey(candidate);
				const match = draftTitleFor(draft, candidate);
				const active = match && draft.titles.includes(match) ? match : null;
				const removed = !!match && !active;
				const label = active
					? draft.newIds.has(active.imdbId.toLowerCase())
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
