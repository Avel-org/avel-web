import { Link } from "@tanstack/react-router";
import type { CanonPart } from "avel-server/contract";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ENTITY_LABEL } from "./activity-copy";
import { labelOf } from "./activity-record";
import { formatUsd } from "./dispatch-budget";
import { Markdown } from "./markdown";

/*
 * The structured pieces of a Canon reply, beside its text: what a fetch
 * read, as a card for one row or a compact table for many. Cells are plain
 * values; a timestamp or a dollar amount is formatted here, by its value or
 * its column, never parsed out of the reply's prose.
 */

type Cell = string | number | boolean | null;

const ISO =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
// UTC, so the server's render and the browser's agree.
const WHEN = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** A column holds dollars when its key or label says so: "spendUsd", "Spent (USD)". */
export const isUsdColumn = (key: string, label = "") =>
	/usd/i.test(key) || /\(USD\)|\$/.test(label);

/** One cell as text: a dash for none, Yes or No, dollars, a UTC time, a grouped number. */
export function formatCell(value: Cell, usd = false): string {
	if (value === null) return "—";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number")
		return usd ? formatUsd(value) : COUNT.format(value);
	if (ISO.test(value)) {
		const at = Date.parse(value);
		if (!Number.isNaN(at)) return `${WHEN.format(at)} UTC`;
	}
	return value;
}

/** The parts of one message, in order. Nothing when it has none. */
export function CanonParts({
	parts,
	seq,
}: {
	parts: readonly CanonPart[];
	/** The message's seq, for each part's test id. */
	seq: number;
}) {
	if (parts.length === 0) return null;
	return (
		<div
			data-testid={`canon-parts-${seq}`}
			className="flex min-w-0 flex-col gap-2"
		>
			{parts.map((part, i) => {
				const testId = `canon-part-${seq}-${i}`;
				// A part has no id, and a reply's parts never reorder.
				const key = `${part.type}:${i}`;
				switch (part.type) {
					case "text":
						return (
							<div key={key} data-testid={testId} data-part="text">
								<Markdown text={part.md} />
							</div>
						);
					case "entity":
						return <EntityCard key={key} part={part} testId={testId} />;
					case "table":
						return <PartTable key={key} part={part} testId={testId} />;
				}
				// A part type this build does not know yet shows nothing.
				return null;
			})}
		</div>
	);
}

type EntityPart = Extract<CanonPart, { type: "entity" }>;

/** The words for an entity type: the activity log's, else from its name. */
function entityLabel(type: string): string {
	return (ENTITY_LABEL as Record<string, string>)[type] ?? labelOf(type);
}

/** One row read by id: its type and name, then its fields; a link where the app has its page. */
function EntityCard({ part, testId }: { part: EntityPart; testId: string }) {
	const name = part.fields.name ?? part.fields.title ?? null;
	const heading = (
		<>
			<span className="type-caption text-text-subtle">
				{entityLabel(part.entityType)}
			</span>
			{typeof name === "string" ? (
				<span className="truncate type-small font-medium text-text">
					{name}
				</span>
			) : null}
		</>
	);
	const linkClass =
		"flex min-w-0 flex-col underline decoration-border underline-offset-2 hover:decoration-current";
	const facts = Object.entries(part.fields).filter(
		([key]) => key !== "name" && key !== "title",
	);
	return (
		<div
			data-testid={testId}
			data-part="entity"
			data-entity-type={part.entityType}
			title={part.id}
			className="flex min-w-0 flex-col gap-2 rounded-control border border-border bg-app-raised px-3 py-2"
		>
			{part.entityType === "mission" ? (
				<Link to="/missions/$id" params={{ id: part.id }} className={linkClass}>
					{heading}
				</Link>
			) : part.entityType === "client" ? (
				<Link to="/clients/$id" params={{ id: part.id }} className={linkClass}>
					{heading}
				</Link>
			) : (
				<div className="flex min-w-0 flex-col">{heading}</div>
			)}
			{facts.length > 0 ? (
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
					{facts.map(([key, value]) => (
						<div key={key} className="contents">
							<dt className="type-caption text-text-subtle">{labelOf(key)}</dt>
							<dd
								className={cn(
									"min-w-0 truncate type-small text-text",
									typeof value === "number" && "tabular-nums",
								)}
							>
								{formatCell(value, isUsdColumn(key))}
							</dd>
						</div>
					))}
				</dl>
			) : null}
		</div>
	);
}

type TablePart = Extract<CanonPart, { type: "table" }>;

/** Many rows: a compact table that scrolls sideways inside the bubble. */
function PartTable({ part, testId }: { part: TablePart; testId: string }) {
	return (
		<div
			data-testid={testId}
			data-part="table"
			className="min-w-0 overflow-hidden rounded-control border border-border"
		>
			{part.rows.length === 0 ? (
				<p className="px-3 py-2 type-small text-text-muted">No rows.</p>
			) : (
				<Table className="type-small">
					<TableHeader>
						<TableRow>
							{part.columns.map((c) => (
								<TableHead key={c.key} className="h-8 px-2.5 type-caption">
									{c.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{part.rows.map((row, r) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a row has no id of its own, and a part's rows never reorder
							<TableRow key={r}>
								{part.columns.map((c) => {
									const value = row[c.key] ?? null;
									return (
										<TableCell
											key={c.key}
											className={cn(
												"px-2.5 py-1.5 whitespace-nowrap",
												typeof value === "number" && "text-right",
											)}
										>
											{formatCell(value, isUsdColumn(c.key, c.label))}
										</TableCell>
									);
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
