import { LayoutGrid, List, Search } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { KIND } from "./drive-files";
import { FILE_KINDS, type FileKind } from "./drive-placeholders";

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
	const searchId = useId();
	const sortId = useId();
	return (
		<div data-testid={testId} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-48 flex-1">
					<label htmlFor={searchId} className="sr-only">
						Search files
					</label>
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-subtle"
					/>
					<Input
						id={searchId}
						type="search"
						data-testid={`${testId}-search`}
						placeholder="Search by name"
						value={controls.q ?? ""}
						onChange={(event) =>
							onChange({ q: event.target.value || undefined })
						}
						className="h-8 pl-8"
					/>
				</div>
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
					className="inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5"
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
							size="sm"
							variant={controls.view === id ? "secondary" : "ghost"}
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
				className="flex flex-wrap items-center gap-1"
			>
				<legend className="sr-only">Kind</legend>
				{([undefined, ...FILE_KINDS] as const).map((kind) => {
					const pressed = controls.kind === kind;
					return (
						<Button
							key={kind ?? "all"}
							size="sm"
							variant={pressed ? "secondary" : "ghost"}
							aria-pressed={pressed}
							data-testid={`${testId}-kind-${kind ?? "all"}`}
							onClick={() => onChange({ kind })}
							className="rounded-full"
						>
							{kind ? KIND[kind].plural : "All"}
							<span
								data-testid={`${testId}-kind-${kind ?? "all"}-count`}
								className="type-mono-small text-text-subtle tabular-nums"
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
