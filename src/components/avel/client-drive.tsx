import { useMemo, useState } from "react";
import { SampleRegion } from "./catalog-sample";
import { visibleFiles } from "./drive-browser";
import { DropZone, FileGrid, FileList, NoteCards } from "./drive-files";
import { FilePanelSheet } from "./drive-panel";
import {
	DRIVE_MISSING,
	FILE_KINDS,
	type FileKind,
	kindOf,
	type SampleFile,
	sampleFilesForClient,
	sampleNotesForClient,
} from "./drive-placeholders";
import { type DriveControls, DriveToolbar } from "./drive-toolbar";

/*
 * A client's Notes and Files tabs (ruling 33), from the same Drive pieces as
 * /drive. The client is real; its files and notes are samples keyed on its
 * id until the Drive's routes exist. The panel is always a sheet here: the
 * client's detail pane is too narrow for an aside.
 */

/** The Notes tab after the client's own notes field: note documents as cards. */
export function ClientNotesDrive({ clientId }: { clientId: string }) {
	const notes = useMemo(() => sampleNotesForClient(clientId), [clientId]);
	return (
		<SampleRegion
			missing={DRIVE_MISSING.notes}
			title="Notes from the Drive"
			what="Call notes and decisions kept as documents for this client. Canon reads them when drafting an intake."
			data-testid="client-notes-drive"
		>
			<NoteCards notes={notes} />
		</SampleRegion>
	);
}

/** The Files tab: the client's files, engagement files tagged, list or grid. */
export function ClientFilesDrive({ clientId }: { clientId: string }) {
	const { files, engagements } = useMemo(
		() => sampleFilesForClient(clientId),
		[clientId],
	);
	// An engagement file is tagged with its engagement; the rest are the client's own.
	const scopeOf = (f: SampleFile) =>
		engagements.find((e) => e.id === f.engagementId)?.name ?? "Client";
	const [controls, setControls] = useState<DriveControls>({
		sort: "newest",
		view: "list",
	});
	const [selected, setSelected] = useState<string | undefined>(undefined);
	const shown = visibleFiles(files, { kind: "all" }, controls);
	const counts = { all: files.length } as Record<FileKind, number> & {
		all: number;
	};
	for (const kind of FILE_KINDS) {
		counts[kind] = files.filter((f) => kindOf(f.mime) === kind).length;
	}
	const file = files.find((f) => f.id === selected);

	return (
		<div data-testid="client-files" className="flex flex-col gap-3">
			<DriveToolbar
				testId="client-files-toolbar"
				controls={controls}
				onChange={(next) => setControls((prev) => ({ ...prev, ...next }))}
				counts={counts}
			/>
			<DropZone data-testid="client-files-drop" />
			<SampleRegion
				missing={DRIVE_MISSING.files}
				title="Client files"
				what="Documents for this client and its engagements, engagement files tagged. Never readable by another client's agents."
				data-testid="client-files-drive"
			>
				{controls.view === "grid" ? (
					<FileGrid files={shown} selectedId={selected} onOpen={setSelected} />
				) : (
					<FileList
						files={shown}
						onOpen={setSelected}
						scopeOf={scopeOf}
						data-testid="client-file-list"
					/>
				)}
			</SampleRegion>
			{file ? (
				<FilePanelSheet
					file={file}
					onClose={() => setSelected(undefined)}
					open
				/>
			) : null}
		</div>
	);
}
