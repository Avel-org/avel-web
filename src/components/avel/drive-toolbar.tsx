import { LayoutGrid, List } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { KIND } from "./drive-files";
import { FILE_KINDS, type FileKind } from "./drive-placeholders";
import { SearchField } from "./search-field";

/*
 * The toolbar: search, kind chips, sort and the List | Grid toggle. Real
 * controls over whatever files the page has; on /drive their state is the
 * URL's, so a filtered view is a link.
 */

export type DriveView = "list" | "grid";
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
				<fieldset
					data-testid={`${testId}-view`}
					className={tabsListVariants({ variant: "default" })}
				>
					<legend className="sr-only">View</legend>
					{(
						[
							["list", "List", List],
							["grid", "Grid", LayoutGrid],
						] as const
					).map(([id, label, Icon]) => (
						<Button
							key={id}
							type="button"
							variant="segment"
							aria-pressed={controls.view === id}
							data-testid={`${testId}-view-${id}`}
							onClick={() => onChange({ view: id })}
						>
							<Icon aria-hidden="true" />
							{label}
						</Button>
					))}
				</fieldset>
			</div>
			<fieldset
				data-testid={`${testId}-kinds`}
				className={cn(tabsListVariants({ variant: "default" }), "flex-wrap")}
			>
				<legend className="sr-only">Kind</legend>
				{([undefined, ...FILE_KINDS] as const).map((kind) => {
					const pressed = controls.kind === kind;
					return (
						<Button
							key={kind ?? "all"}
							type="button"
							variant="segment"
							aria-pressed={pressed}
							data-testid={`${testId}-kind-${kind ?? "all"}`}
							onClick={() => onChange({ kind })}
						>
							{kind ? KIND[kind].plural : "All"}
							<span
								data-testid={`${testId}-kind-${kind ?? "all"}-count`}
								className="type-mono text-text-subtle tabular-nums"
							>
								{kind ? counts[kind] : counts.all}
							</span>
						</Button>
					);
				})}
			</fieldset>
		</div>
	);
}
