import { useEffect, useRef, useState } from 'react';
import type { Title } from '../../domain/types.ts';
import type { PasteLine } from '../../domain/pasteLines.ts';
import type { MatchResult } from '../../tmdb/match.ts';
import type { Candidate } from '../../tmdb/search.ts';
import { api } from '../../client/api.ts';
import {
	candidateKey,
	hasIdentity,
	titleFor,
	lookupCandidate,
	type CurrentTitles,
} from '../../client/titleIdentity.ts';

export type AddStatus = 'added' | 'duplicate' | 'restored';
export type AddTitle = (title: Title) => AddStatus | Promise<AddStatus>;
export type ReviewLine = PasteLine & { result: MatchResult; resolved: boolean };

export function Search({
	initialQuery = '',
	current,
	disabled,
	add,
	busy,
	onAdded,
	onPending,
}: {
	initialQuery?: string;
	current: CurrentTitles;
	disabled: boolean;
	add: AddTitle;
	busy: (delta: number) => void;
	onAdded?: (status: AddStatus, title: Title) => void;
	onPending?: (pending: boolean) => void;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [adding, setAdding] = useState(false);
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
					if (controller.signal.aborted) return;
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
					disabled={disabled || adding}
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
				current={current}
				disabled={disabled}
				add={add}
				busy={busy}
				onAdded={onAdded}
				onPending={(value) => {
					setAdding(value);
					onPending?.(value);
				}}
			/>
		</>
	);
}
export function Candidates({
	candidates,
	current,
	disabled,
	add,
	busy,
	onAdded,
	onPending,
}: {
	candidates: Candidate[];
	current: CurrentTitles;
	disabled: boolean;
	add: AddTitle;
	busy: (delta: number) => void;
	onAdded?: (status: AddStatus, title: Title) => void;
	onPending?: (pending: boolean) => void;
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
		[...current.titles, ...current.removed]
			.filter((title) => title.tmdbId === null)
			.map((title) => title.type)
	);
	const unidentified = candidates.filter(
		(candidate) =>
			missingTypes.has(candidate.type) &&
			!hasIdentity(candidate) &&
			!titleFor(current, candidate)
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
		// One addition at a time: the caller may be awaiting a save.
		if (disabled || inFlight.current.size) return;
		inFlight.current.add(key);
		onPending?.(true);
		setPending(new Set(inFlight.current));
		busy(1);
		setErrors((errors) => ({ ...errors, [key]: '' }));
		try {
			const title = await lookupCandidate(
				candidate,
				controller.current!.signal
			);
			controller.current!.signal.throwIfAborted();
			const status = await add(title);
			if (!controller.current!.signal.aborted) onAdded?.(status, title);
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
			if (!controller.current!.signal.aborted) onPending?.(false);
			busy(-1);
			if (!controller.current!.signal.aborted)
				setPending(new Set(inFlight.current));
		}
	}
	return (
		<ul className="title-grid search-grid">
			{candidates.map((candidate) => {
				const key = candidateKey(candidate);
				const match = titleFor(current, candidate);
				const active = match && current.titles.includes(match) ? match : null;
				const removed = !!match && !active;
				const label = active
					? current.newIds?.has(active.imdbId.toLowerCase())
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
							disabled={disabled || !!active || pending.size > 0}
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

/**
 * The owner retains review state and any remembered line-to-IMDb choices.
 * Rows are reported by object identity, so the owner should replace a resolved
 * row rather than mutate it, and ignore a row no longer in its review.
 */
export function NeedALook({
	rows,
	onResolved,
	...controls
}: {
	rows: ReviewLine[];
	current: CurrentTitles;
	disabled: boolean;
	add: AddTitle;
	busy: (delta: number) => void;
	onResolved: (row: ReviewLine, status?: AddStatus, title?: Title) => void;
}) {
	// One addition at a time across rows: repeated lines can offer the same
	// candidate, and an awaited save must not race another.
	const [pendingRow, setPendingRow] = useState<ReviewLine | null>(null);
	const blocking = pendingRow && rows.includes(pendingRow) ? pendingRow : null;
	return (
		<>
			{rows.map((row, index) =>
				row.resolved ? null : (
					<ReviewRow
						key={`${row.line}-${index}`}
						row={row}
						{...controls}
						disabled={controls.disabled || (!!blocking && blocking !== row)}
						onPending={(pending) =>
							setPendingRow((current) =>
								pending ? row : current === row ? null : current
							)
						}
						onResolved={(status, title) => onResolved(row, status, title)}
					/>
				)
			)}
		</>
	);
}
function ReviewRow({
	row,
	onResolved,
	onPending,
	...controls
}: {
	row: ReviewLine;
	current: CurrentTitles;
	disabled: boolean;
	add: AddTitle;
	busy: (delta: number) => void;
	onResolved: (status?: AddStatus, title?: Title) => void;
	onPending: (pending: boolean) => void;
}) {
	const [pending, setPending] = useState(false);
	const pendingChanged = (value: boolean) => {
		setPending(value);
		onPending(value);
	};
	return (
		<div className="match-review">
			<h4>{row.line}</h4>
			{row.result.status === 'none' || row.result.status === 'ambiguous' ? (
				<>
					{row.result.reason && (
						<p>
							No match
							{row.result.reason !== 'No match'
								? ` · ${row.result.reason}`
								: ''}
						</p>
					)}
					{row.result.status === 'none' ? (
						<Search
							initialQuery={row.name}
							{...controls}
							onAdded={onResolved}
							onPending={pendingChanged}
						/>
					) : (
						<Candidates
							candidates={row.result.candidates}
							{...controls}
							onAdded={onResolved}
							onPending={pendingChanged}
						/>
					)}
				</>
			) : null}
			<button
				type="button"
				disabled={controls.disabled || pending}
				onClick={() => onResolved()}
			>
				Skip
			</button>
		</div>
	);
}
