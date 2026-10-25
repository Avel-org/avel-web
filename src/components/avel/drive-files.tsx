import {
	FileArchive,
	FileImage,
	FileSpreadsheet,
	FileText,
	type LucideIcon,
	NotebookText,
	Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DataColumn, DataTable } from "./data-table";
import {
	type FileKind,
	kindOf,
	type SampleFile,
	type SampleNote,
	scopePath,
	sizeLabel,
} from "./drive-placeholders";
import { ShortHash } from "./short-hash";

/*
 * The Drive's shared pieces, used by /drive and by a client's Notes and Files
 * tabs (ruling 33): the kind table, icon tiles, the list and grid, recent
 * cards, note cards, the drop zone and the write controls. Every file shown
 * is a sample; the write controls are real, disabled with their reason,
 * because the Drive's routes are built after the first mission.
 */

/** Why every Drive write is disabled today. */
export const DRIVE_WRITE_REASON =
	"The Drive's storage is built after the first mission. Uploads, downloads and deletes arrive then.";

/** Why a tombstone has no download. */
export const PURGED_REASON =
	"This file's bytes were destroyed when it was deleted. The record is kept.";

/**
 * Each kind's words, icon and tone. v3 keeps category hues for data series,
 * never decoration, and the gate colours carry meanings of their own, so
 * every kind shares v3's neutral tile and the icon tells them apart. This
 * table is the one place a tone is chosen, so a change is one line each.
 */
export const KIND = {
	document: {
		label: "Document",
		plural: "Documents",
		icon: FileText,
		tile: "bg-app-raised text-text-muted",
	},
	spreadsheet: {
		label: "Spreadsheet",
		plural: "Spreadsheets",
		icon: FileSpreadsheet,
		tile: "bg-app-raised text-text-muted",
	},
	image: {
		label: "Image",
		plural: "Images",
		icon: FileImage,
		tile: "bg-app-raised text-text-muted",
	},
	archive: {
		label: "Archive",
		plural: "Archives",
		icon: FileArchive,
		tile: "bg-app-raised text-text-muted",
	},
	note: {
		label: "Note",
		plural: "Notes",
		icon: NotebookText,
		tile: "bg-app-raised text-text-muted",
	},
} as const satisfies Record<
	FileKind,
	{ label: string; plural: string; icon: LucideIcon; tile: string }
>;

/** A file's kind as an icon on a rounded tile. */
export function FileIconTile({
	file,
	size = "sm",
}: {
	file: Pick<SampleFile, "mime">;
	size?: "sm" | "md" | "lg";
}) {
	const kind = kindOf(file.mime);
	const Icon = KIND[kind].icon;
	return (
		<span
			aria-hidden="true"
			data-testid="drive-file-tile"
			data-kind={kind}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-tile",
				size === "sm" && "size-tile-md [&_svg]:size-4",
				size === "md" && "size-tile-lg [&_svg]:size-5",
				size === "lg" && "size-14 [&_svg]:size-7",
				KIND[kind].tile,
			)}
		>
			<Icon />
		</span>
	);
}

/** Two letters for a login: "JA" for javaris500, "FL" for front-desk-lead. */
export function initialsOfLogin(login: string): string {
	const parts = login.split(/[-_.]/).filter(Boolean);
	const letters =
		parts.length > 1
			? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
			: login.slice(0, 2);
	return letters.toUpperCase();
}

/** Who uploaded a file: an initials avatar and the login. */
export function Uploader({ login }: { login: string }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-app-raised type-caption text-text-muted ring-1 ring-border"
			>
				{initialsOfLogin(login)}
			</span>
			<span className="type-small text-text-muted">{login}</span>
		</span>
	);
}

/** "2026-03-14", the date part only. */
export const dateLabel = (iso: string) => iso.slice(0, 10);

/**
 * The name, with the whole of it on hover since it may be cut. In the list a
 * tombstone's name is struck through and dimmed, with its badge beside it.
 * A grid card is too narrow for both (the badge left the name one struck
 * letter wide), so it passes `card`: the name stays plain and the card says
 * the bytes are gone on its own line.
 */
function FileName({
	file,
	under,
	card = false,
}: {
	file: SampleFile;
	under?: string;
	card?: boolean;
}) {
	const purged = file.purgedAt !== null;
	return (
		<span className="flex min-w-0 flex-col">
			<span className="flex min-w-0 items-center gap-2">
				<span
					data-testid="drive-file-name"
					title={file.name}
					className={cn(
						"type-small min-w-0 truncate font-medium",
						!purged
							? "text-foreground"
							: card
								? "text-text-muted"
								: "text-text-subtle line-through",
					)}
				>
					{file.name}
				</span>
				{purged && !card ? (
					<Badge
						variant="outline"
						data-testid="drive-file-purged"
						className="shrink-0"
					>
						Bytes destroyed
					</Badge>
				) : null}
			</span>
			{under ? (
				<span className="type-caption truncate text-text-subtle">{under}</span>
			) : null}
		</span>
	);
}

const dimIfPurged = (file: SampleFile) =>
	file.purgedAt !== null && "opacity-60";

/** The list's columns; `scopeOf` says where each file lives, under its name. */
const listColumns = (
	scopeOf: (file: SampleFile) => string,
): DataColumn<SampleFile>[] => [
	{
		id: "name",
		header: "Name",
		cell: (file) => (
			<span className="flex min-w-0 items-center gap-3">
				<span className={cn(dimIfPurged(file))}>
					<FileIconTile file={file} />
				</span>
				<FileName file={file} under={scopeOf(file)} />
			</span>
		),
	},
	{
		id: "uploader",
		header: "Uploaded by",
		width: "11rem",
		cell: (file) => (
			<span className={cn(dimIfPurged(file))}>
				<Uploader login={file.uploadedBy} />
			</span>
		),
	},
	{
		id: "size",
		header: "Size",
		align: "end",
		mono: true,
		width: "6rem",
		cell: (file) =>
			file.purgedAt !== null ? (
				<span className="text-text-subtle">—</span>
			) : (
				sizeLabel(file.bytes)
			),
	},
	{
		id: "date",
		header: "Uploaded",
		mono: true,
		width: "7.5rem",
		cell: (file) => (
			<time dateTime={file.createdAt} className={cn(dimIfPurged(file))}>
				{dateLabel(file.createdAt)}
			</time>
		),
	},
	{
		id: "sha",
		header: "SHA-256",
		width: "7rem",
		cell: (file) => (
			<span className={cn(dimIfPurged(file))}>
				<ShortHash value={file.sha256} label="the SHA-256" />
			</span>
		),
	},
];

/** The list view: one dense row per file; a row opens the panel. */
export function FileList({
	files,
	onOpen,
	scopeOf = scopePath,
	"data-testid": testId = "drive-file-list",
}: {
	files: SampleFile[];
	onOpen: (id: string) => void;
	/** Where a file lives, in words; the Drive's own scope names by default. */
	scopeOf?: (file: SampleFile) => string;
	"data-testid"?: string;
}) {
	return (
		<DataTable
			label="Files"
			data-testid={testId}
			columns={listColumns(scopeOf)}
			rows={files}
			getRowId={(file) => file.id}
			density="compact"
			stickyHeader={false}
			onRowClick={(file) => onOpen(file.id)}
			viewKey="drive-files"
		/>
	);
}

/** "PDF", "XLSX": a file's extension, as the grid names its type. */
export function extensionOf(name: string): string | null {
	const at = name.lastIndexOf(".");
	return at > 0 && at < name.length - 1
		? name.slice(at + 1).toUpperCase()
		: null;
}

/**
 * A card's thumbnail until previews exist: one frame holding the kind's icon
 * and the file's extension, so a grid of mixed files reads by type at a
 * glance. An image's frame is gridded, the placeholder a preview will fill.
 */
function Thumbnail({ file }: { file: SampleFile }) {
	const kind = KIND[kindOf(file.mime)];
	const image = kindOf(file.mime) === "image";
	const Icon = kind.icon;
	const ext = extensionOf(file.name);
	return (
		<span
			data-testid="drive-file-thumb"
			data-placeholder={image || undefined}
			className={cn(
				// A short strip, not a tall frame: the card stays near a row's height.
				"flex h-16 w-full flex-col items-center justify-center gap-1 rounded-control border border-border bg-app-raised text-text-muted",
				image &&
					"bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:16px_16px]",
			)}
		>
			<Icon aria-hidden="true" className="size-5" />
			<span className="type-caption font-medium tracking-wide text-text-subtle">
				{ext ?? kind.label}
			</span>
		</span>
	);
}

/** The grid view: cards, an image placeholder thumbnail on each. */
/** What a held file carries: its id, under its own type, never text. */
const FILE_DRAG_TYPE = "application/x-avel-file";

export function FileGrid({
	files,
	selectedId,
	onOpen,
	heldId,
	onHold,
}: {
	files: SampleFile[];
	selectedId: string | undefined;
	onOpen: (id: string) => void;
	/** The file being dragged to a folder, drawn lifted. */
	heldId?: string | null;
	/** Picked up (an id) or put down (null). Unset, the cards don't drag. */
	onHold?: (id: string | null) => void;
}) {
	return (
		<ul
			data-testid="drive-file-grid"
			data-enter="rise"
			className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5"
		>
			{files.map((file) => (
				<li key={file.id}>
					<button
						type="button"
						data-testid={`drive-card-${file.id}`}
						data-purged={file.purgedAt !== null || undefined}
						data-held={heldId === file.id || undefined}
						aria-pressed={file.id === selectedId}
						// A tombstone stays where it was: it has no bytes to move.
						draggable={onHold !== undefined && file.purgedAt === null}
						onDragStart={(event) => {
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData(FILE_DRAG_TYPE, file.id);
							onHold?.(file.id);
						}}
						onDragEnd={() => onHold?.(null)}
						onClick={() => onOpen(file.id)}
						className={cn(
							"focus-inset flex w-full flex-col gap-1.5 rounded-card border border-border bg-app-panel p-2 text-left shadow-card transition-[color,background-color,border-color,box-shadow,translate] duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised active:scale-[0.995] aria-pressed:border-selected-border aria-pressed:bg-selected",
							onHold &&
								file.purgedAt === null &&
								"cursor-grab active:cursor-grabbing",
							// Held: lifted on the drag shadow, as a Teams chip is.
							heldId === file.id &&
								"-translate-y-px border-border-strong shadow-drag",
							dimIfPurged(file),
						)}
					>
						<Thumbnail file={file} />
						<FileName file={file} card />
						{file.purgedAt !== null ? (
							// The bytes are gone, so there is no size to show; the
							// card says so in words, with the date they went on hover.
							<Badge
								variant="outline"
								data-testid="drive-file-purged"
								title={`Destroyed ${dateLabel(file.purgedAt)}`}
								className="self-start"
							>
								Bytes destroyed
							</Badge>
						) : (
							<span className="flex items-center justify-between gap-2 type-mono whitespace-nowrap text-text-subtle">
								<span>{sizeLabel(file.bytes)}</span>
								<span>{dateLabel(file.createdAt)}</span>
							</span>
						)}
					</button>
				</li>
			))}
		</ul>
	);
}

/** The most recent files still held, as larger cards. */
export function RecentFiles({
	files,
	onOpen,
}: {
	files: SampleFile[];
	onOpen: (id: string) => void;
}) {
	return (
		<ul
			data-testid="drive-recent"
			// Two columns, or four once the column is wide enough: four cards never
			// leave an orphan. Measured on the column, not the window, so an open
			// panel or the rail counts.
			className="grid grid-cols-2 gap-3 @3xl:grid-cols-4"
		>
			{files.map((file) => (
				<li key={file.id}>
					<button
						type="button"
						data-testid={`drive-recent-${file.id}`}
						onClick={() => onOpen(file.id)}
						className="focus-inset flex w-full items-center gap-2.5 rounded-card border border-border bg-app-panel px-2.5 py-2 text-left transition-colors duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised"
					>
						<FileIconTile file={file} size="md" />
						<span className="flex min-w-0 flex-col gap-0.5">
							<span
								title={file.name}
								className="type-small truncate font-medium text-foreground"
							>
								{file.name}
							</span>
							<span className="flex flex-wrap gap-x-3 type-mono whitespace-nowrap text-text-subtle">
								<span>{sizeLabel(file.bytes)}</span>
								<span>{dateLabel(file.createdAt)}</span>
							</span>
						</span>
					</button>
				</li>
			))}
		</ul>
	);
}

/** A note as a card: title, author and date, then its opening lines. */
export function NoteCards({ notes }: { notes: SampleNote[] }) {
	return (
		<ul data-testid="drive-notes" className="flex flex-col gap-2">
			{notes.map((note) => (
				<li
					key={note.id}
					data-testid="drive-note"
					className="flex gap-3 rounded-card border border-border bg-app-panel p-3"
				>
					<FileIconTile file={note} />
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<div className="flex items-baseline justify-between gap-3">
							<span
								data-testid="drive-note-title"
								title={note.title}
								className="type-small truncate font-medium text-foreground"
							>
								{note.title}
							</span>
							<time
								dateTime={note.createdAt}
								className="type-mono shrink-0 text-text-subtle"
							>
								{dateLabel(note.createdAt)}
							</time>
						</div>
						<span className="type-caption text-text-subtle">{`By ${note.uploadedBy}`}</span>
						<p className="type-small line-clamp-2 text-text-muted">
							{note.excerpt}
						</p>
					</div>
				</li>
			))}
		</ul>
	);
}

/** Upload: real, and disabled with its reason. */
export function UploadButton({
	"data-testid": testId,
	variant = "default",
}: {
	"data-testid": string;
	variant?: "default" | "outline";
}) {
	return (
		<Button
			size="sm"
			variant={variant}
			data-testid={testId}
			disabledReason={DRIVE_WRITE_REASON}
		>
			<Upload aria-hidden="true" />
			Upload
		</Button>
	);
}

/**
 * Where files will be dropped: a slim bar over the files, or a large target
 * in an empty folder. Visibly inert, and says why beside its disabled button.
 * A page whose top bar already has Upload passes `upload={false}`, so the
 * page has one Upload control and the zone is only the drop target.
 */
export function DropZone({
	size = "bar",
	upload = true,
	"data-testid": testId,
}: {
	size?: "bar" | "large";
	upload?: boolean;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			aria-disabled="true"
			className={cn(
				"flex items-center gap-3 rounded-card border border-dashed border-border-strong bg-app-well/50 text-text-subtle",
				size === "bar"
					? "px-3 py-2"
					: "flex-col justify-center px-6 py-10 text-center",
			)}
		>
			<Upload
				aria-hidden="true"
				className={size === "bar" ? "size-4" : "size-6"}
			/>
			<span className={cn("min-w-0 flex-1", size === "large" && "flex-none")}>
				<span className="type-small block text-text-muted">
					Drop files here to upload
				</span>
				<span className="type-caption block">
					Not yet: storage is built after the first mission.
				</span>
			</span>
			{upload ? (
				<UploadButton data-testid={`${testId}-upload`} variant="outline" />
			) : null}
		</div>
	);
}
