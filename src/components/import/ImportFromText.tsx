import { useEffect, useMemo, useRef, useState } from 'react';
import { indexEntry, type ListIndexEntry } from '../../storage/lists.ts';
import {
	parseImport,
	nameLengthOk,
	findExistingName,
	validateImportName,
	validateImportSections,
	type SectionPreview,
} from '../../domain/pasteSections.ts';
import { ImportListRun } from '../../client/importList.ts';
import { ImportQueue } from '../../client/importQueue.ts';
import { NeedALook } from '../titles/TitleControls.tsx';
import {
	buildNuvioCollection,
	collectionExportUrl,
} from '../../domain/nuvioCollection.ts';
import { downloadCollection } from '../../client/downloadCollection.ts';
import CollectionDialog from './CollectionDialog.tsx';

export default function ImportFromText({
	initialLists,
	initialCollection,
	addonId,
}: {
	initialLists: ListIndexEntry[];
	initialCollection?: string | null;
	addonId?: string;
}) {
	const collectionMode =
		initialCollection !== undefined && initialCollection !== null;
	const [mode, setMode] = useState<'single' | 'multiple'>(
		collectionMode ? 'multiple' : 'single'
	);
	const [collectionTitle, setCollectionTitle] = useState(
		initialCollection ?? ''
	);
	const [collectionTouched, setCollectionTouched] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [downloadMessage, setDownloadMessage] = useState('');
	const [downloadError, setDownloadError] = useState('');
	const offered = useRef(false);
	const collectionError = nameLengthOk(collectionTitle)
		? ''
		: 'Enter a collection title of 100 characters or fewer.';
	const [name, setName] = useState('');
	const [text, setText] = useState('');
	const [preview, setPreview] = useState<SectionPreview[]>([]);
	const [nameTouched, setNameTouched] = useState(false);
	const [textTouched, setTextTouched] = useState(false);
	const [fileError, setFileError] = useState('');
	const [reading, setReading] = useState(false);
	const [, refresh] = useState(0);
	const changed = () => refresh((value) => value + 1);
	const single = useRef<ImportListRun | null>(null);
	const queue = useRef<ImportQueue | null>(null);
	const controller = useRef(new AbortController());
	const readId = useRef(0);
	useEffect(() => {
		controller.current = new AbortController();
		return () => {
			controller.current.abort();
			readId.current++;
		};
	}, []);
	const parsed = useMemo(() => parseImport(text, 'single'), [text]);
	const multiple = useMemo(() => parseImport(text, 'multiple'), [text]);
	const runs = queue.current
		? queue.current.entries.map((entry) => entry.run)
		: single.current
			? [single.current]
			: [];
	const active =
		!!queue.current?.active ||
		runs.some((run) =>
			['matching', 'creating', 'saving'].includes(run.state.phase)
		);
	const exportIds = runs
		.filter(
			(run) =>
				run.state.phase === 'completed' && run.state.list!.titles.length > 0
		)
		.map((run) => run.state.list!.id);
	const locked =
		!!queue.current || runs.some((run) => run.state.phase !== 'empty');
	const rejected = single.current?.state.phase === 'rejected';
	const nameError = validateImportName(name, initialLists);
	const existing = findExistingName(name, initialLists);
	const sectionErrors =
		mode === 'single'
			? parsed.errors
			: validateImportSections(multiple, preview, initialLists);
	// Header collisions must be fixed in the source text even if preview names or selections change.
	// Unticking can't clear them: a partial collection under the same title would replace the full one in Nuvio.
	const headerErrors = collectionMode
		? validateImportSections(
				multiple,
				multiple.sections.map((section) => ({ ...section, selected: true })),
				initialLists
			).flatMap((error) => {
				switch (error.code) {
					case 'duplicate-header':
						return [
							{
								...error,
								sectionId: undefined,
								message: `Lines ${error.previousLine} and ${error.line}: the header "${error.name}" is used twice. Each header must be unique. Edit the text box to fix it.`,
							},
						];
					case 'existing-list':
						return [
							{
								...error,
								sectionId: undefined,
								message: `Line ${error.line}: a list named "${error.name}" already exists. Change the header in the text box. If an earlier import created it, remove its section and use Export collection afterwards.`,
							},
						];
					default:
						return [];
				}
			})
		: [];
	// Collisions made by renaming in the preview keep Sprint 13's wording beside the renamed field.
	const errors = [
		...headerErrors,
		...sectionErrors
			.filter(
				(error) =>
					!headerErrors.some(
						(header) => header.code === error.code && header.line === error.line
					)
			)
			.map((error) =>
				collectionMode && error.code === 'no-headers'
					? {
							...error,
							message:
								'No "## " list headers found. A collection needs a "## " header for each list.',
						}
					: error
			),
	];
	const nothing =
		mode === 'single'
			? !parsed.lines.length
			: !preview.some((section) => section.selected);
	const unresolved = runs.reduce(
		(total, run) =>
			total + run.state.review.filter((row) => !row.resolved).length,
		0
	);
	const pendingSave = runs.some(
		(run) => run.state.phase === 'stopped' && run.state.list
	);
	const unfinishedQueue = !!queue.current?.unfinished;
	const collectionReady =
		collectionMode &&
		!!queue.current &&
		!unfinishedQueue &&
		!active &&
		exportIds.length > 0;
	useEffect(() => {
		if (collectionReady && !offered.current) {
			offered.current = true;
			setDialogOpen(true);
		}
	}, [collectionReady]);
	function download() {
		setDownloadError('');
		setDownloadMessage('');
		try {
			if (collectionError) throw new Error(collectionError);
			const completed = runs
				.filter((run) => run.completed && run.state.list!.titles.length > 0)
				.map((run) => indexEntry(run.state.list!));
			downloadCollection(
				buildNuvioCollection(
					collectionTitle,
					completed.map((list) => ({
						listId: list.id,
						name: list.name,
						types: list.types,
					})),
					addonId
				),
				collectionTitle
			);
			setDownloadMessage(
				`Collection downloaded with ${completed.length} folders. Import the JSON in Nuvio.`
			);
		} catch (failure) {
			setDownloadError(
				failure instanceof Error
					? failure.message
					: 'Unable to download. Try again.'
			);
		}
	}
	useEffect(() => {
		if (!unfinishedQueue && !unresolved && !active && !pendingSave) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		const fullLoad = (event: Event) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		document.addEventListener('astro:before-preparation', fullLoad);
		return () => {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('astro:before-preparation', fullLoad);
		};
	}, [unresolved, active, pendingSave, unfinishedQueue]);
	function replaceText(content: string) {
		offered.current = false;
		setDialogOpen(false);
		setDownloadMessage('');
		setText(content);
		setPreview(
			parseImport(content, 'multiple').sections.map((section) => ({
				...section,
				selected: true,
			}))
		);
		single.current = null;
		queue.current = null;
		changed();
	}
	async function upload(file: File) {
		setTextTouched(true);
		const id = ++readId.current;
		setFileError('');
		if (!/\.(txt|md)$/i.test(file.name)) {
			setFileError('Choose a .txt or .md file.');
			return;
		}
		setReading(true);
		try {
			const content = await file.text();
			if (id === readId.current) replaceText(content);
		} catch {
			if (id === readId.current)
				setFileError('Unable to read this file. Try uploading it again.');
		} finally {
			if (id === readId.current) setReading(false);
		}
	}
	const invalid =
		reading ||
		!!fileError ||
		!!errors.length ||
		nothing ||
		(mode === 'single' && !!nameError) ||
		(collectionMode && !!collectionError);
	function start() {
		setNameTouched(true);
		setTextTouched(true);
		if (
			active ||
			locked ||
			invalid ||
			queue.current ||
			(single.current && single.current.state.phase !== 'empty')
		)
			return;
		if (mode === 'multiple') {
			queue.current = new ImportQueue(preview, changed);
			void queue.current.continue(controller.current.signal);
		} else {
			single.current = new ImportListRun(name, parsed.lines, changed);
			void single.current.continue(controller.current.signal);
		}
	}
	return (
		<div className="discovery-panels">
			<section className="panel">
				{!collectionMode && (
					<div role="group" aria-label="Import mode">
						<button
							type="button"
							aria-pressed={mode === 'single'}
							disabled={locked || reading}
							onClick={() => setMode('single')}
						>
							Single list
						</button>
						<button
							type="button"
							aria-pressed={mode === 'multiple'}
							disabled={locked || reading}
							onClick={() => setMode('multiple')}
						>
							Multiple lists
						</button>
					</div>
				)}
				{collectionMode && (
					<>
						<label htmlFor="collection-title">Collection title</label>
						<input
							id="collection-title"
							maxLength={100}
							required
							value={collectionTitle}
							onChange={(event) => {
								setCollectionTouched(true);
								setCollectionTitle(event.target.value);
							}}
						/>
						{(collectionTouched || textTouched) && collectionError && (
							<p className="error" role="alert">
								{collectionError}
							</p>
						)}
						<p>
							Re-exporting the same name (ignoring capitals) uses the same
							collection ID. Importing it can replace that collection in Nuvio.
						</p>
					</>
				)}
				{mode === 'single' && (
					<>
						<label htmlFor="import-name">List name</label>
						<input
							id="import-name"
							value={name}
							disabled={(locked && !rejected) || reading}
							onChange={(event) => {
								setNameTouched(true);
								setName(event.target.value);
								if (rejected) single.current?.rename(event.target.value);
								else {
									single.current = null;
									changed();
								}
							}}
						/>
						{nameTouched && nameError && (
							<p className="error" role="alert">
								{nameError}
								{existing && (
									<>
										{' '}
										<a href={`/lists/${encodeURIComponent(existing.id)}`}>
											Open existing list
										</a>
									</>
								)}
							</p>
						)}
					</>
				)}
				<label htmlFor="import-text">
					{mode === 'multiple'
						? 'Start each list with ## Name, then one Title per line'
						: 'One Title per line, optionally with a year (1999)'}
				</label>
				<textarea
					id="import-text"
					rows={12}
					value={text}
					disabled={locked || reading}
					onChange={(event) => {
						setTextTouched(true);
						replaceText(event.target.value);
						setFileError('');
					}}
				/>
				{collectionMode &&
					textTouched &&
					errors
						.filter((error) => !error.sectionId)
						.map((error, index) => (
							<p key={index} className="error" role="alert">
								{error.message}
							</p>
						))}
				<label htmlFor="import-upload">Upload .txt/.md</label>
				<input
					id="import-upload"
					type="file"
					accept=".txt,.md,text/plain,text/markdown"
					disabled={locked || reading}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) void upload(file);
					}}
				/>
				{fileError && (
					<p className="error" role="alert">
						{fileError}
					</p>
				)}
				{mode === 'multiple' &&
					preview.map((section) => (
						<div key={section.id} className="panel">
							<label>
								<input
									type="checkbox"
									checked={section.selected}
									disabled={locked || reading}
									onChange={(event) =>
										setPreview((rows) =>
											rows.map((row) =>
												row.id === section.id
													? { ...row, selected: event.target.checked }
													: row
											)
										)
									}
								/>
								Import “{section.name || 'Unnamed list'}” (line {section.line})
							</label>
							<label htmlFor={`name-${section.id}`}>
								List name (line {section.line})
							</label>
							<input
								id={`name-${section.id}`}
								value={section.name}
								disabled={
									reading ||
									(locked &&
										queue.current?.entries.find(
											(entry) => entry.sectionId === section.id
										)?.run.state.phase !== 'rejected')
								}
								onChange={(event) => {
									setPreview((rows) =>
										rows.map((row) =>
											row.id === section.id
												? { ...row, name: event.target.value }
												: row
										)
									);
									queue.current?.entries
										.find((entry) => entry.sectionId === section.id)
										?.run.rename(event.target.value);
								}}
							/>
							<p>{section.lines.length} Titles parsed</p>
							{errors
								.filter((error) => error.sectionId === section.id)
								.map((error, index) => (
									<p key={index} className="error" role="alert">
										{error.message}
									</p>
								))}
						</div>
					))}
				{errors
					.filter(
						(error) =>
							!collectionMode && (mode === 'single' || !error.sectionId)
					)
					.filter(() => mode === 'single' || textTouched)
					.map((error, index) => (
						<p key={index} className="error" role="alert">
							{error.message}
						</p>
					))}
				{textTouched && mode === 'single' && !parsed.lines.length && (
					<p className="error" role="alert">
						Paste at least one title.
					</p>
				)}
				<button type="button" disabled={locked || invalid} onClick={start}>
					Import
				</button>
				{reading && <p role="status">Reading file…</p>}
			</section>
			{queue.current && (
				<section className="panel">
					<p role="status">{queue.current.progress}</p>
					{!active && queue.current.unfinished && (
						<button
							type="button"
							disabled={!!errors.length || reading}
							onClick={() =>
								void queue.current?.continue(controller.current.signal)
							}
						>
							Continue import
						</button>
					)}
					{!active &&
						queue.current.unfinished &&
						(queue.current.unfinished.run.canSkip ? (
							<button
								type="button"
								onClick={() => queue.current?.skipUnfinished()}
							>
								Skip this list
							</button>
						) : (
							<p>
								Continue this list before moving on: its creation or save is
								pending.
							</p>
						))}
					{collectionMode ? (
						<p>
							Keep this page open to continue. Lists already created stay saved.
							To finish after closing or reloading, remove their sections from
							the text, import the rest, then use Export collection to build the
							full collection. Use the editor to finish a list awaiting its
							save.
						</p>
					) : (
						<p>
							Keep this page open to continue. After closing or reloading,
							re-paste the file and untick already-created lists. Use the editor
							to finish a list awaiting its save.
						</p>
					)}
				</section>
			)}
			{exportIds.length > 0 && (
				<p>
					<a
						href={collectionExportUrl(
							exportIds,
							collectionMode ? collectionTitle : undefined
						)}
					>
						Export these as a Nuvio collection
					</a>
				</p>
			)}
			{collectionReady && (
				<button type="button" onClick={() => setDialogOpen(true)}>
					Download collection
				</button>
			)}
			{collectionMode && (
				<CollectionDialog
					open={dialogOpen}
					onClose={() => setDialogOpen(false)}
					title={collectionTitle}
					folders={exportIds.length}
					disabled={!!collectionError}
					onDownload={download}
					message={downloadMessage}
					error={downloadError}
				/>
			)}
			{collectionMode && !dialogOpen && downloadMessage && (
				<p role="status">{downloadMessage}</p>
			)}
			{runs.map((run, index) => (
				<ImportResult
					key={queue.current?.entries[index].sectionId ?? 'single'}
					run={run}
					signal={controller.current.signal}
					active={['matching', 'creating', 'saving'].includes(run.state.phase)}
					onContinue={
						!queue.current && ['stopped', 'rejected'].includes(run.state.phase)
							? () => void run.continue(controller.current.signal)
							: undefined
					}
					continueDisabled={!!nameError && rejected}
				/>
			))}
		</div>
	);
}

function ImportResult({
	run,
	signal,
	active,
	onContinue,
	continueDisabled,
}: {
	run: ImportListRun;
	signal: AbortSignal;
	active: boolean;
	onContinue?: () => void;
	continueDisabled?: boolean;
}) {
	const [busy, setBusy] = useState(0);
	const [copyMessage, setCopyMessage] = useState('');
	const state = run.state;
	const unresolved = state.review.filter((row) => !row.resolved).length;
	return (
		<section className="panel" aria-label={`Result: ${run.name}`}>
			<h2>
				{state.list ? (
					<a href={`/lists/${encodeURIComponent(state.list.id)}`}>
						{state.list.name}
					</a>
				) : (
					run.name
				)}
				{state.list && state.phase !== 'completed' ? ' — save pending' : ''}
			</h2>
			<p role="status">
				{state.phase === 'idle' ? 'Not started' : state.progress}
			</p>
			{state.error && (
				<p className="error" role="alert">
					{state.error}
				</p>
			)}
			{onContinue && (
				<button type="button" disabled={continueDisabled} onClick={onContinue}>
					Continue import
				</button>
			)}
			{state.phase === 'completed' && (
				<>
					<p role="status">
						{state.list!.titles.length} Titles saved · {state.duplicates}{' '}
						duplicates skipped · {unresolved} Need a look
					</p>
					<p className="notice">
						Saved. Refresh the Listio addon in Nuvio to see new Catalogs. Title
						updates can take up to a minute.
					</p>
					{unresolved > 0 && (
						<>
							<h3>Need a look</h3>
							<button
								type="button"
								onClick={() =>
									void navigator.clipboard
										.writeText(run.unresolvedText())
										.then(() => setCopyMessage('Unresolved lines copied.'))
										.catch(() =>
											setCopyMessage(
												'Unable to copy. Select and copy the remaining lines below.'
											)
										)
								}
							>
								Copy unresolved lines
							</button>
							<p role="status">{copyMessage}</p>
						</>
					)}
					<NeedALook
						rows={state.review}
						current={state.list!}
						disabled={busy > 0 || active}
						busy={(delta) => setBusy((value) => value + delta)}
						add={(title) => run.add(title, signal)}
						onResolved={(row, status) =>
							run.resolve(row, status === 'duplicate')
						}
					/>
				</>
			)}
		</section>
	);
}
