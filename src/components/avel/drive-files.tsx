import {
	Check,
	Copy,
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
import { useCopy } from "@/lib/clipboard";
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
 * Each kind's words, icon and tone. No file-kind colour tokens exist, and the
 * gate and diff colours carry meanings of their own, so kinds sit on one
 * steel ramp of the existing text-muted token; the icon tells them apart.
 * Proposed: --color-kind-document, -spreadsheet, -image, -archive, -note.
 * This table is the one place a tone is chosen, so the swap is one line each.
 */
export const KIND = {
	document: {
		label: "Document",
		plural: "Documents",
		icon: FileText,
		tile: "bg-text-muted/15 text-foreground",
		bar: "bg-text-muted",
	},
	spreadsheet: {
		label: "Spreadsheet",
		plural: "Spreadsheets",
		icon: FileSpreadsheet,
		tile: "bg-text-muted/15 text-foreground",
		bar: "bg-text-muted/75",
	},
	image: {
		label: "Image",
		plural: "Images",
		icon: FileImage,
		tile: "bg-text-muted/15 text-foreground",
		bar: "bg-text-muted/55",
	},
	archive: {
		label: "Archive",
		plural: "Archives",
		icon: FileArchive,
		tile: "bg-text-muted/15 text-foreground",
		bar: "bg-text-muted/35",
	},
	note: {
		label: "Note",
		plural: "Notes",
		icon: NotebookText,
		tile: "bg-accent-soft text-accent-text",
		bar: "bg-accent",
	},
} as const satisfies Record<
	FileKind,
	{ label: string; plural: string; icon: LucideIcon; tile: string; bar: string }
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
				"inline-flex shrink-0 items-center justify-center rounded-sm",
				size === "sm" && "size-8 [&_svg]:size-4",
				size === "md" && "size-10 [&_svg]:size-5",
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

/** A sha256: eight characters in mono, the full value on hover, and Copy. */
export function ShortSha({
	sha,
	copyable = false,
	"data-testid": testId,
}: {
	sha: string;
	copyable?: boolean;
	"data-testid"?: string;
}) {
	const { status, copy } = useCopy();
	return (
		<span data-testid={testId} className="inline-flex items-center gap-1">
			<code
				title={sha}
				data-full={sha}
				className="type-mono-small text-text-muted"
			>
				{sha.slice(0, 8)}
			</code>
			{copyable ? (
				<>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Copy the SHA-256"
						data-testid={testId ? `${testId}-copy` : undefined}
						onClick={(event) => {
							event.stopPropagation();
							void copy(sha);
						}}
					>
						{status === "Copied" ? (
							<Check aria-hidden="true" />
						) : (
							<Copy aria-hidden="true" />
						)}
					</Button>
					<span aria-live="polite" className="sr-only">
						{status}
					</span>
				</>
			) : null}
		</span>
	);
}

/** "2026-03-14", the date part only. */
export const dateLabel = (iso: string) => iso.slice(0, 10);

/** The name, struck through and dimmed for a tombstone, with its badge. */
function FileName({ file, under }: { file: SampleFile; under?: string }) {
	const purged = file.purgedAt !== null;
	return (
		<span className="flex min-w-0 flex-col">
			<span className="flex min-w-0 items-center gap-2">
				<span
					data-testid="drive-file-name"
					className={cn(
						"type-small min-w-0 truncate font-medium",
						purged ? "text-text-subtle line-through" : "text-foreground",
					)}
				>
					{file.name}
				</span>
				{purged ? (
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
				<ShortSha sha={file.sha256} />
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
		/>
	);
}

/** An image's stand-in until previews exist: a framed, gridded placeholder. */
function Thumbnail({ file }: { file: SampleFile }) {
	const image = kindOf(file.mime) === "image";
	return (
		<span
			data-testid="drive-file-thumb"
			data-placeholder={image || undefined}
			className={cn(
				"flex aspect-[16/10] w-full items-center justify-center rounded-sm border border-border",
				image
					? "bg-app-recessed bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:16px_16px]"
					: "bg-app-recessed",
			)}
		>
			<FileIconTile file={file} size="md" />
		</span>
	);
}

/** The grid view: cards, an image placeholder thumbnail on each. */
export function FileGrid({
	files,
	selectedId,
	onOpen,
}: {
	files: SampleFile[];
	selectedId: string | undefined;
	onOpen: (id: string) => void;
}) {
	return (
		<ul
			data-testid="drive-file-grid"
			className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
		>
			{files.map((file) => (
				<li key={file.id}>
					<button
						type="button"
						data-testid={`drive-card-${file.id}`}
						data-purged={file.purgedAt !== null || undefined}
						aria-pressed={file.id === selectedId}
						onClick={() => onOpen(file.id)}
						className={cn(
							"focus-inset flex w-full flex-col gap-2 rounded-md border border-border bg-app-panel p-2.5 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover aria-pressed:border-accent aria-pressed:bg-state-selected",
							dimIfPurged(file),
						)}
					>
						<Thumbnail file={file} />
						<FileName file={file} />
						<span className="flex items-center justify-between gap-2 type-mono-small text-text-subtle">
							<span>
								{file.purgedAt !== null ? "—" : sizeLabel(file.bytes)}
							</span>
							<span>{dateLabel(file.createdAt)}</span>
						</span>
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
						className="focus-inset flex w-full items-center gap-3 rounded-md border border-border surface-steel bg-app-panel p-3 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
					>
						<FileIconTile file={file} size="md" />
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="type-small truncate font-medium text-foreground">
								{file.name}
							</span>
							<span className="flex flex-wrap gap-x-3 type-mono-small whitespace-nowrap text-text-subtle">
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
					className="flex gap-3 rounded-md border border-border bg-app-panel p-3"
				>
					<FileIconTile file={note} />
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<div className="flex items-baseline justify-between gap-3">
							<span
								data-testid="drive-note-title"
								className="type-small truncate font-medium text-foreground"
							>
								{note.title}
							</span>
							<time
								dateTime={note.createdAt}
								className="type-mono-small shrink-0 text-text-subtle"
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
 */
export function DropZone({
	size = "bar",
	"data-testid": testId,
}: {
	size?: "bar" | "large";
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			aria-disabled="true"
			className={cn(
				"flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-app-recessed/50 text-text-subtle",
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
			<UploadButton data-testid={`${testId}-upload`} variant="outline" />
		</div>
	);
}
