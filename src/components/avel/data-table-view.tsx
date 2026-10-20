import { Columns3, GripVertical, RotateCcw } from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { tabsListVariants } from "@/components/ui/tabs";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";

/*
 * A table's own view, chosen by the viewer and kept per table in this
 * browser: which columns show, in what order, and how dense the rows sit.
 * The Columns menu is v3's .menu with .menu-row rows: a grip, a checkbox and
 * the column's name, "7 of 9 shown" at its head, and the row being dragged
 * lifted on shadow-drag (.menu-row.drag). Density is a v3 .segmented pair,
 * Comfort or Compact, read through --row-comfortable and --row-compact.
 *
 * A stored view is read against the columns the table has today: a column
 * it no longer has is dropped, a new one is added at the end and shown, and
 * at least one column always shows.
 */

export type Density = "comfortable" | "compact";
export const DENSITIES = ["comfortable", "compact"] as const;

export type StoredView = { order: string[]; hidden: string[] };

export type ViewColumn = { id: string; label: string };

/** A stored view, made to fit the columns the table has now. */
export function fitView(
	ids: readonly string[],
	stored: StoredView | null,
): StoredView {
	if (stored === null) return { order: [...ids], hidden: [] };
	const known = new Set(ids);
	const order = stored.order.filter((id) => known.has(id));
	for (const id of ids) if (!order.includes(id)) order.push(id);
	const hidden = stored.hidden.filter((id) => known.has(id));
	// Never every column hidden: the first in order shows.
	if (hidden.length >= order.length && order[0] !== undefined)
		return { order, hidden: hidden.filter((id) => id !== order[0]) };
	return { order, hidden };
}

/** The order with one column moved to another's place. */
export function moveColumn(
	order: readonly string[],
	from: number,
	to: number,
): string[] {
	if (from === to || from < 0 || to < 0 || to >= order.length)
		return [...order];
	const next = [...order];
	const [moved] = next.splice(from, 1);
	if (moved !== undefined) next.splice(to, 0, moved);
	return next;
}

function readStored(key: string): StoredView | null {
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return null;
		const value: unknown = JSON.parse(raw);
		if (
			typeof value === "object" &&
			value !== null &&
			Array.isArray((value as StoredView).order) &&
			Array.isArray((value as StoredView).hidden)
		)
			return value as StoredView;
	} catch {
		// Storage unavailable or the value unreadable: the default view.
	}
	return null;
}

/**
 * The view for one table, by its storage key. Without a key the table has
 * no menu and shows every column at its own density.
 */
export function useTableView(
	key: string | undefined,
	ids: readonly string[],
	fallbackDensity: Density,
) {
	const columnsKey = `avel.table.${key ?? "none"}.columns`;
	const [stored, setStored] = useState<StoredView | null>(null);
	const [density, setDensity] = useStoredState<Density>(
		`avel.table.${key ?? "none"}.density`,
		fallbackDensity,
		DENSITIES,
	);
	useEffect(() => {
		if (key !== undefined) setStored(readStored(columnsKey));
	}, [key, columnsKey]);
	const view = fitView(ids, stored);
	const save = useCallback(
		(next: StoredView | null) => {
			setStored(next);
			try {
				if (next === null) window.localStorage.removeItem(columnsKey);
				else window.localStorage.setItem(columnsKey, JSON.stringify(next));
			} catch {
				// Storage unavailable: the view lasts for this page only.
			}
		},
		[columnsKey],
	);
	return {
		enabled: key !== undefined,
		view,
		shown: view.order.filter((id) => !view.hidden.includes(id)),
		density: key === undefined ? fallbackDensity : density,
		setDensity,
		save,
	};
}

/** The table's toolbar: Row density, then the Columns menu. */
export function TableViewControls({
	columns,
	view,
	onView,
	density,
	onDensity,
	"data-testid": testId,
}: {
	columns: readonly ViewColumn[];
	view: StoredView;
	onView: (next: StoredView | null) => void;
	density: Density;
	onDensity: (next: Density) => void;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2"
		>
			<fieldset
				data-testid={`${testId}-density`}
				className={tabsListVariants({ variant: "default" })}
			>
				<legend className="sr-only">Row density</legend>
				{(
					[
						["comfortable", "Comfort"],
						["compact", "Compact"],
					] as const
				).map(([value, label]) => (
					<Button
						key={value}
						type="button"
						variant="segment"
						aria-pressed={density === value}
						data-testid={`${testId}-density-${value}`}
						onClick={() => onDensity(value)}
					>
						{label}
					</Button>
				))}
			</fieldset>
			<ColumnsMenu
				columns={columns}
				view={view}
				onView={onView}
				testId={`${testId}-columns`}
			/>
		</div>
	);
}

function ColumnsMenu({
	columns,
	view,
	onView,
	testId,
}: {
	columns: readonly ViewColumn[];
	view: StoredView;
	onView: (next: StoredView | null) => void;
	testId: string;
}) {
	const [dragging, setDragging] = useState<number | null>(null);
	const headingId = useId();
	const labelOf = (id: string) => columns.find((c) => c.id === id)?.label ?? id;
	const shownCount = view.order.length - view.hidden.length;

	const toggle = (id: string, show: boolean) =>
		onView({
			order: view.order,
			hidden: show ? view.hidden.filter((h) => h !== id) : [...view.hidden, id],
		});
	const move = (from: number, to: number) =>
		onView({ order: moveColumn(view.order, from, to), hidden: view.hidden });

	// The grip moves its row with the arrow keys, as dragging does.
	const onGripKey = (index: number) => (event: KeyboardEvent) => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault();
		move(index, index + (event.key === "ArrowUp" ? -1 : 1));
	};
	const onDrop = (index: number) => (event: DragEvent) => {
		event.preventDefault();
		if (dragging !== null) move(dragging, index);
		setDragging(null);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid={`${testId}-trigger`}
				>
					<Columns3 aria-hidden="true" />
					Columns
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				data-testid={testId}
				aria-labelledby={headingId}
				className="w-64 p-1.5"
			>
				<ColumnsList
					headingId={headingId}
					order={view.order}
					hidden={view.hidden}
					labelOf={labelOf}
					shownCount={shownCount}
					dragging={dragging}
					onDragStart={setDragging}
					onDragEnd={() => setDragging(null)}
					onDrop={onDrop}
					onGripKey={onGripKey}
					onToggle={toggle}
					onReset={() => onView(null)}
					testId={testId}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** The menu's body, apart from the popover, so it renders in a test. */
export function ColumnsList({
	headingId,
	order,
	hidden,
	labelOf,
	shownCount,
	dragging = null,
	onDragStart = () => {},
	onDragEnd = () => {},
	onDrop = () => () => {},
	onGripKey = () => () => {},
	onToggle,
	onReset,
	testId,
}: {
	headingId: string;
	order: readonly string[];
	hidden: readonly string[];
	labelOf: (id: string) => string;
	shownCount: number;
	dragging?: number | null;
	onDragStart?: (index: number) => void;
	onDragEnd?: () => void;
	onDrop?: (index: number) => (event: DragEvent) => void;
	onGripKey?: (index: number) => (event: KeyboardEvent) => void;
	onToggle: (id: string, show: boolean) => void;
	onReset: () => void;
	testId: string;
}) {
	return (
		<>
			<div className="flex items-baseline justify-between gap-2 px-2.5 pt-1.5 pb-2">
				<h2 id={headingId} className="type-small font-medium text-text">
					Columns
				</h2>
				<span
					data-testid={`${testId}-count`}
					className="type-caption text-text-subtle tabular-nums"
				>
					{`${shownCount} of ${order.length} shown`}
				</span>
			</div>
			<ul className="flex flex-col">
				{order.map((id, index) => {
					const visible = !hidden.includes(id);
					const last = visible && shownCount === 1;
					const label = labelOf(id);
					return (
						<li
							key={id}
							data-testid={`${testId}-row-${id}`}
							data-dragging={dragging === index || undefined}
							draggable
							onDragStart={() => onDragStart(index)}
							onDragEnd={onDragEnd}
							onDragOver={(event) => event.preventDefault()}
							onDrop={onDrop(index)}
							className={cn(
								"flex h-9 items-center gap-2 rounded-control border border-transparent px-1.5 type-body transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
								dragging === index &&
									"relative z-(--z-raised) border-border-strong bg-chip shadow-drag",
							)}
						>
							<button
								type="button"
								aria-label={`Move ${label}. Use the up and down arrows.`}
								data-testid={`${testId}-grip-${id}`}
								onKeyDown={onGripKey(index)}
								className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-xs text-text-subtle hover:text-text"
							>
								<GripVertical aria-hidden="true" className="size-3.5" />
							</button>
							<Checkbox
								id={`${testId}-check-${id}`}
								checked={visible}
								disabled={last}
								onCheckedChange={(next) => onToggle(id, next === true)}
								data-testid={`${testId}-check-${id}`}
								aria-describedby={last ? `${testId}-last` : undefined}
							/>
							<label
								htmlFor={`${testId}-check-${id}`}
								className={cn(
									"min-w-0 flex-1 truncate",
									visible ? "text-text" : "text-text-muted",
								)}
							>
								{label}
							</label>
						</li>
					);
				})}
			</ul>
			<p id={`${testId}-last`} className="sr-only">
				At least one column stays shown.
			</p>
			<div className="mt-1 flex justify-end border-t border-border px-1 pt-1.5">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid={`${testId}-reset`}
					onClick={onReset}
				>
					<RotateCcw aria-hidden="true" />
					Reset
				</Button>
			</div>
		</>
	);
}
