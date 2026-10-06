import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import {
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * One column of a DataTable. The table is typed by its columns: `cell` gets
 * the row, so the row type is whatever the caller's data is. There is no
 * domain type in this file.
 */
export type DataColumn<T> = {
	id: string;
	header: ReactNode;
	cell: (row: T) => ReactNode;
	align?: "start" | "center" | "end";
	/** Any CSS width, such as "8rem" or "20%". */
	width?: string;
	/** Machine text: hashes, IDs, counts. Set in mono with tabular numerals. */
	mono?: boolean;
	/** Shows a sort control in the header when the table has onSortChange. */
	sortable?: boolean;
};

export type SortState = { column: string; direction: "asc" | "desc" } | null;

const ALIGN = { start: "text-left", center: "text-center", end: "text-right" };

/**
 * A data table, built on the shadcn Table parts.
 *
 * - Density is set once on the container, from --row-comfortable or
 *   --row-compact (AVEL-DESIGN.md section 4), never per row.
 * - The header sticks under the page's top bar. That needs a table with no
 *   scrolling wrapper, so this renders its own <table> rather than the Table
 *   primitive's overflow-x-auto one. A table too wide for its column can pass
 *   `stickyHeader={false}` to get horizontal scrolling back instead.
 * - Sorting is the caller's: the table shows `sort` and reports clicks
 *   through `onSortChange`, and holds no sorting logic.
 * - `renderDetail` adds a leading chevron to each row and an inline detail row
 *   that opens with a grid-row animation and is inert while closed. A row's
 *   detail is not rendered until it is first opened, so a detail that fetches
 *   fetches on expand, never for every row on load. Once opened it stays
 *   mounted, so closing still animates.
 * - `onRowClick` makes rows actionable by pointer and by keyboard (Enter or
 *   Space on the focused row).
 * - Below md, `renderCard` replaces the table with stacked cards.
 */
export function DataTable<T>({
	label,
	columns,
	rows,
	getRowId,
	density = "comfortable",
	stickyHeader = true,
	sort = null,
	onSortChange,
	renderDetail,
	onRowClick,
	renderCard,
	"data-testid": testId,
}: {
	/** What the table lists, for screen readers. Rendered as a hidden caption. */
	label: string;
	columns: DataColumn<T>[];
	rows: T[];
	getRowId: (row: T) => string;
	density?: "comfortable" | "compact";
	stickyHeader?: boolean;
	sort?: SortState;
	onSortChange?: (next: SortState) => void;
	renderDetail?: (row: T) => ReactNode;
	onRowClick?: (row: T) => void;
	renderCard?: (row: T) => ReactNode;
	"data-testid": string;
}) {
	const detailPrefix = useId();
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const toggle = (id: string) => {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setExpanded(next);
	};
	// Rows whose detail has ever been open, recorded during render.
	const opened = useRef(new Set<string>());
	for (const id of expanded) opened.current.add(id);
	const span = columns.length + (renderDetail ? 1 : 0);

	const table = (
		<table data-slot="table" className="w-full caption-bottom text-sm">
			<caption className="sr-only">{label}</caption>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					{renderDetail ? (
						<TableHead className={cn("w-10", stickyHeader && STICKY)}>
							<span className="sr-only">Details</span>
						</TableHead>
					) : null}
					{columns.map((column) => (
						<HeaderCell
							key={column.id}
							column={column}
							sort={sort}
							onSortChange={onSortChange}
							sticky={stickyHeader}
							testId={testId}
						/>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => {
					const id = getRowId(row);
					const open = expanded.has(id);
					const detailId = `${detailPrefix}-${id}`;
					return (
						<Fragment key={id}>
							<TableRow
								data-testid={`${testId}-row-${id}`}
								data-expanded={renderDetail ? open : undefined}
								className={cn(
									onRowClick && "focus-inset cursor-pointer",
									renderDetail && open && "border-b-0",
								)}
								// A clickable row needs a keyboard path with the same result as a click.
								tabIndex={onRowClick ? 0 : undefined}
								onClick={onRowClick ? () => onRowClick(row) : undefined}
								onKeyDown={
									onRowClick
										? (event: KeyboardEvent) => {
												// Keys pressed on a control inside the row are that control's.
												if (event.target !== event.currentTarget) return;
												if (event.key !== "Enter" && event.key !== " ") return;
												event.preventDefault();
												onRowClick(row);
											}
										: undefined
								}
							>
								{renderDetail ? (
									<TableCell className="w-10 py-(--row-pad)">
										<button
											type="button"
											data-testid={`${testId}-expand-${id}`}
											aria-expanded={open}
											aria-controls={detailId}
											aria-label={open ? "Hide details" : "Show details"}
											onClick={(event) => {
												event.stopPropagation();
												toggle(id);
											}}
											onKeyDown={(event) => event.stopPropagation()}
											className="flex size-7 items-center justify-center rounded-full text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover hover:text-foreground"
										>
											<ChevronRight
												aria-hidden="true"
												className={cn(
													"size-4 transition-transform duration-(--duration-state) ease-avel",
													open && "rotate-90",
												)}
											/>
										</button>
									</TableCell>
								) : null}
								{columns.map((column) => (
									<TableCell
										key={column.id}
										className={cn(
											"px-3 py-(--row-pad)",
											ALIGN[column.align ?? "start"],
											column.mono && "type-mono tabular-nums",
										)}
									>
										{column.cell(row)}
									</TableCell>
								))}
							</TableRow>
							{renderDetail ? (
								<tr
									id={detailId}
									data-testid={`${testId}-detail-${id}`}
									data-state={open ? "open" : "closed"}
									className={cn(open && "border-b border-border")}
								>
									<td colSpan={span} className="p-0">
										<div
											inert={!open}
											className={cn(
												"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
												open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
											)}
										>
											<div className="min-h-0 overflow-clip">
												<div className="bg-app-recessed px-3 py-3 pl-13">
													{opened.current.has(id) ? renderDetail(row) : null}
												</div>
											</div>
										</div>
									</td>
								</tr>
							) : null}
						</Fragment>
					);
				})}
			</TableBody>
		</table>
	);

	return (
		<div
			data-testid={testId}
			data-density={density}
			className={cn(
				density === "compact"
					? "[--row-pad:var(--row-compact)]"
					: "[--row-pad:var(--row-comfortable)]",
			)}
		>
			<div
				data-testid={`${testId}-table`}
				className={cn(
					!stickyHeader && "overflow-x-auto",
					renderCard && "max-md:hidden",
				)}
			>
				{table}
			</div>
			{renderCard ? (
				<ul
					data-testid={`${testId}-cards`}
					aria-label={label}
					className="flex flex-col gap-2 p-2 md:hidden"
				>
					{rows.map((row) => (
						<li
							key={getRowId(row)}
							data-testid={`${testId}-card-${getRowId(row)}`}
						>
							{renderCard(row)}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

// The header sits under the page's sticky top bar, above the rows.
const STICKY = "sticky top-(--topbar-height) z-(--z-raised)";

function HeaderCell<T>({
	column,
	sort,
	onSortChange,
	sticky,
	testId,
}: {
	column: DataColumn<T>;
	sort: SortState;
	onSortChange?: (next: SortState) => void;
	sticky: boolean;
	testId: string;
}) {
	const sortable = column.sortable === true && onSortChange !== undefined;
	const direction = sort?.column === column.id ? sort.direction : undefined;
	const align = column.align ?? "start";

	return (
		<TableHead
			data-column={column.id}
			aria-sort={
				!sortable
					? undefined
					: direction === "asc"
						? "ascending"
						: direction === "desc"
							? "descending"
							: "none"
			}
			style={column.width ? { width: column.width } : undefined}
			className={cn("px-3", ALIGN[align], sticky && STICKY)}
		>
			{sortable ? (
				<button
					type="button"
					data-testid={`${testId}-sort-${column.id}`}
					onClick={() =>
						onSortChange?.({
							column: column.id,
							direction: direction === "asc" ? "desc" : "asc",
						})
					}
					className={cn(
						"inline-flex items-center gap-1 rounded-full transition-colors duration-(--duration-micro) ease-avel hover:text-foreground",
						align === "end" && "flex-row-reverse",
						direction && "text-foreground",
					)}
				>
					{column.header}
					{direction === "asc" ? (
						<ArrowUp aria-hidden="true" className="size-3.5" />
					) : direction === "desc" ? (
						<ArrowDown aria-hidden="true" className="size-3.5" />
					) : (
						<ChevronsUpDown
							aria-hidden="true"
							className="size-3.5 text-text-subtle"
						/>
					)}
				</button>
			) : (
				column.header
			)}
		</TableHead>
	);
}
