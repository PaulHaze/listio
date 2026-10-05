import { useEffect, useRef } from 'react';

export default function CollectionDialog({
	open,
	onClose,
	title,
	folders,
	disabled,
	onDownload,
	message,
	error,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	folders: number;
	disabled: boolean;
	onDownload: () => void;
	message: string;
	error: string;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement;
		const node = dialog.current!;
		node.showModal();
		close.current?.focus();
		return () => {
			node.close();
			if (previous instanceof HTMLElement && previous.isConnected)
				previous.focus();
		};
	}, [open]);
	return (
		<dialog
			className="panel collection-dialog"
			ref={dialog}
			aria-labelledby="collection-dialog-title"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					onClose();
				}
			}}
		>
			<h2 id="collection-dialog-title">{title.trim() || 'New collection'}</h2>
			<p>
				{folders} {folders === 1 ? 'folder' : 'folders'}
			</p>
			<button type="button" disabled={disabled} onClick={onDownload}>
				Download collection
			</button>
			<button type="button" ref={close} onClick={onClose}>
				Close
			</button>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{message && <p role="status">{message}</p>}
			<p>
				If you resolve more Titles in Need a look afterwards, download again to
				include their Catalog types.
			</p>
		</dialog>
	);
}
