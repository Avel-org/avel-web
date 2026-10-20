import {
	ChevronRight,
	Folder,
	FolderOpen,
	HardDrive,
	Users,
} from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	type DriveFolder,
	folderPath,
	folderValue,
	inFolder,
	SAMPLE_CLIENTS,
	type SampleFile,
} from "./drive-placeholders";

/*
 * The folder rail: All files, General, then Clients with each client as a
 * folder and its engagements nested under it, each with its file count. At
 * lg and up it is a column; below, the same folders are one select.
 */

type FolderItem = {
	value: string | undefined;
	label: string;
	depth: 0 | 1 | 2;
	folder: DriveFolder;
};

/** Every folder, in rail order. */
function folderItems(): FolderItem[] {
	const items: FolderItem[] = [
		{ value: undefined, label: "All files", depth: 0, folder: { kind: "all" } },
		{
			value: "general",
			label: "General",
			depth: 0,
			folder: { kind: "general" },
		},
	];
	for (const client of SAMPLE_CLIENTS) {
		const folder: DriveFolder = { kind: "client", client };
		items.push({
			value: folderValue(folder),
			label: client.name,
			depth: 1,
			folder,
		});
		for (const engagement of client.engagements) {
			const nested: DriveFolder = { kind: "engagement", client, engagement };
			items.push({
				value: folderValue(nested),
				label: engagement.name,
				depth: 2,
				folder: nested,
			});
		}
	}
	return items;
}

const countIn = (files: readonly SampleFile[], folder: DriveFolder) =>
	files.filter((f) => inFolder(f, folder)).length;

export function FolderRail({
	files,
	current,
	onChange,
	holding = false,
	onDropFile,
}: {
	files: readonly SampleFile[];
	current: string | undefined;
	onChange: (folder: string | undefined) => void;
	/** A file is held: every folder but All files takes it. */
	holding?: boolean;
	onDropFile?: (folder: string) => void;
}) {
	const items = folderItems();
	const [over, setOver] = useState<string | null>(null);
	return (
		<nav
			aria-label="Folders"
			data-testid="drive-rail"
			className="flex flex-col gap-0.5"
		>
			{items.map((item, i) => {
				const selected = item.value === current;
				// All files is every folder at once, not a place a file can go.
				const target = holding && item.value !== undefined;
				const hovered = target && over === item.value;
				const Icon =
					item.folder.kind === "all"
						? HardDrive
						: selected
							? FolderOpen
							: Folder;
				return (
					<div key={item.value ?? "all"}>
						{/* "Clients" heads the client folders; it is not itself a folder. */}
						{item.depth === 1 && items[i - 1]?.depth === 0 ? (
							<p className="mt-3 mb-1 flex items-center gap-2 px-2 type-caption text-text-subtle">
								<Users aria-hidden="true" className="size-3.5" />
								Clients
							</p>
						) : null}
						<button
							type="button"
							data-testid={`drive-folder-${item.value ?? "all"}`}
							aria-current={selected ? "true" : undefined}
							data-target={target || undefined}
							data-over={hovered || undefined}
							onClick={() => onChange(item.value)}
							onDragOver={(event) => {
								if (!target) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								setOver(item.value ?? null);
							}}
							onDragLeave={() => setOver(null)}
							onDrop={(event) => {
								if (!target || item.value === undefined) return;
								event.preventDefault();
								setOver(null);
								onDropFile?.(item.value);
							}}
							className={cn(
								"focus-inset relative flex w-full items-center gap-2 rounded-control py-1.5 pr-2 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
								item.depth === 0 && "pl-2",
								item.depth === 1 && "pl-3",
								item.depth === 2 && "pl-8",
								selected &&
									"bg-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-selected",
								// While a file is held each folder is a target, dashed;
								// the one under it takes the lanes' drop state.
								target && "outline-1 outline-border-strong outline-dashed",
								hovered && "bg-selected outline-selected-border outline-solid",
							)}
						>
							{item.depth === 2 ? (
								<ChevronRight
									aria-hidden="true"
									className="size-3 shrink-0 text-text-subtle"
								/>
							) : (
								<Icon
									aria-hidden="true"
									className={cn(
										"size-4 shrink-0",
										selected ? "text-accent-text" : "text-text-subtle",
									)}
								/>
							)}
							<span
								className={cn(
									"min-w-0 flex-1 truncate type-small",
									selected ? "text-foreground" : "text-text-muted",
								)}
							>
								{item.label}
							</span>
							<Badge
								variant="count"
								data-testid={`drive-folder-count-${item.value ?? "all"}`}
							>
								{countIn(files, item.folder)}
							</Badge>
						</button>
					</div>
				);
			})}
		</nav>
	);
}

// Radix Select takes no empty value, so "all" stands for All files.
const ALL = "all";

/** The rail as one select, for widths without room for a column. */
export function FolderSelect({
	current,
	onChange,
	fieldLabel = "Folder",
	visibleLabel = false,
	"data-testid": testId = "drive-folder-select",
}: {
	current: string | undefined;
	onChange: (folder: string | undefined) => void;
	/** What the select is for: "Folder", or "Move to" in a file's panel. */
	fieldLabel?: string;
	visibleLabel?: boolean;
	"data-testid"?: string;
}) {
	const id = useId();
	const items = folderItems();
	const label =
		items.find((item) => item.value === current)?.label ?? "All files";
	return (
		<div className="flex items-center gap-2">
			<label
				htmlFor={id}
				className={visibleLabel ? "type-caption text-text-subtle" : "sr-only"}
			>
				{fieldLabel}
			</label>
			<Select
				value={current ?? ALL}
				onValueChange={(next) => onChange(next === ALL ? undefined : next)}
			>
				<SelectTrigger id={id} size="sm" data-testid={testId} className="w-52">
					<SelectValue>{label}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value ?? ALL} value={item.value ?? ALL}>
							{`${" ".repeat(item.depth)}${item.label}`}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/** Drive / Clients / Acme Dental / Booking app; each ancestor a way back up. */
export function FolderCrumbs({
	folder,
	onChange,
}: {
	folder: DriveFolder;
	onChange: (folder: string | undefined) => void;
}) {
	const path = folderPath(folder);
	// Where each crumb leads: Drive to all, Clients to all, a client to itself.
	const target = (i: number): string | undefined => {
		if (folder.kind === "engagement" && i === 2) {
			return folderValue({ kind: "client", client: folder.client });
		}
		return undefined;
	};
	return (
		<nav aria-label="Folder path" data-testid="drive-crumbs">
			<ol className="flex flex-wrap items-center gap-1.5 type-small">
				{path.map((part, i) => {
					const last = i === path.length - 1;
					// "Clients" is a heading, not a folder; it leads back to all files.
					return (
						<li key={part} className="flex items-center gap-1.5">
							{last ? (
								<span aria-current="page" className="text-foreground">
									{part}
								</span>
							) : (
								<button
									type="button"
									onClick={() => onChange(target(i))}
									className="rounded-xs text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:text-foreground"
								>
									{part}
								</button>
							)}
							{last ? null : (
								<span aria-hidden="true" className="text-text-subtle">
									/
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
