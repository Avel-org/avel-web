import { LayoutGrid, List } from "lucide-react";
import { useId } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { KIND } from "./drive-files";
import { FILE_KINDS, type FileKind } from "./drive-placeholders";
import { SearchField } from "./search-field";
import { Segmented } from "./segmented";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * The toolbar: search, kind chips, sort and the List | Grid toggle. Real
 * controls over whatever files the page has; on /drive their state is the
 * URL's, so a filtered view is a link.
 */

export type DriveView = "list" | "grid";

const DRIVE_VIEWS = [
	{ id: "list", label: "List", icon: List },
	{ id: "grid", label: "Grid", icon: LayoutGrid },
] as const satisfies readonly ViewOption<DriveView>[];
export type DriveSort = "newest" | "name" | "size";

export const SORT_LABEL: Record<DriveSort, string> = {
	newest: "Newest",
	name: "Name",
	size: "Size",
};

export type DriveControls = {
	q?: string;
	kind?: FileKind;
	sort: DriveSort;
	view: DriveView;
};

export function DriveToolbar({
	controls,
	onChange,
	counts,
	testId = "drive-toolbar",
}: {
	controls: DriveControls;
	onChange: (next: Partial<DriveControls>) => void;
	/** Files per kind in the current folder, before the kind chip. */
	counts: Record<FileKind, number> & { all: number };
	testId?: string;
}) {
	const sortId = useId();
	return (
		<div data-testid={testId} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				{/* The shared search field, as on Teams: one look for every search. */}
				<SearchField
					value={controls.q ?? ""}
					onChange={(q) => onChange({ q: q || undefined })}
					label="Search files"
					placeholder="Search by name"
					shortcut="/"
					className="min-w-48 flex-1"
					data-testid={`${testId}-search`}
				/>
				<div className="flex items-center gap-2">
					<label htmlFor={sortId} className="type-caption text-text-subtle">
						Sort
					</label>
					<Select
						value={controls.sort}
						onValueChange={(sort) => onChange({ sort: sort as DriveSort })}
					>
						<SelectTrigger
							id={sortId}
							size="sm"
							data-testid={`${testId}-sort`}
							className="w-28"
						>
							<SelectValue>{SORT_LABEL[controls.sort]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{(Object.keys(SORT_LABEL) as DriveSort[]).map((sort) => (
								<SelectItem key={sort} value={sort}>
									{SORT_LABEL[sort]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<ViewToggle
					options={DRIVE_VIEWS}
					view={controls.view}
					onChange={(view) => onChange({ view })}
					testIdPrefix={`${testId}-view`}
				/>
			</div>
			<Segmented
				data-testid={`${testId}-kind`}
				legend="Kind"
				options={([undefined, ...FILE_KINDS] as const).map((kind) => ({
					value: kind,
					label: kind ? KIND[kind].plural : "All",
					count: kind ? counts[kind] : counts.all,
				}))}
				value={controls.kind}
				onChange={(kind) => onChange({ kind })}
				className="self-start"
			/>
		</div>
	);
}
