import { Link } from "@tanstack/react-router";
import type { ActivityEntry } from "avel-server/contract";
import { History, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedActivity, type useActivity } from "@/lib/api/activity";
import { relativeTime } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ActivityActor } from "./activity-actor";
import { AgentTarget } from "./activity-agent";
import {
	AuditTable,
	ClockTime,
	DecisionRecord,
	dayLabel,
	groupByDay,
	RecordLink,
} from "./activity-audit";
import { ACTION_COPY, ENTITY_LABEL } from "./activity-copy";
import { entityNameOf } from "./activity-record";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";

/**
 * The log, newest first, a page at a time, through <Surface>. The route owns
 * the query and the filters; this renders them. An empty log under a filter
 * says the filter matched nothing and offers to clear it; an empty log with
 * none says nothing has happened yet.
 */
export function ActivityLog({
	query,
	filtered,
	onClearFilters,
	now,
	selectedId,
	onSelect = () => {},
}: {
	query: ReturnType<typeof useActivity>;
	filtered: boolean;
	onClearFilters: () => void;
	/** Fixed by the page, so relative times render once and do not churn. */
	now: number;
	/** The entry whose decision record is open: the URL's `entry`. */
	selectedId?: string;
	onSelect?: (id: string | undefined) => void;
}) {
	return (
		<Surface
			data-testid="activity-log"
			query={query}
			isEmpty={(data) => loadedActivity(data).length === 0}
			loading={<ActivityLogSkeleton />}
			empty={
				filtered ? (
					<EmptyState
						data-testid="activity-no-match"
						compact
						icon={ListFilter}
						title="No entries match"
						description="Nothing in the log matches these filters."
						action={
							<Button
								size="sm"
								variant="outline"
								data-testid="activity-clear-filters"
								onClick={onClearFilters}
							>
								Clear filters
							</Button>
						}
					/>
				) : (
					<EmptyState
						data-testid="activity-empty"
						compact
						icon={History}
						title="Nothing has happened yet"
						description="Every change AVEL makes is recorded here, in order, and never edited. The entity filter above lists every kind it records."
					/>
				)
			}
			error={ErrorState}
		>
			{(data) => {
				const entries = loadedActivity(data);
				const open = selectedId !== undefined;
				return (
					// The record docks beside the log at xl, the pre-flight
					// pattern: nothing slides over the log. Narrower, it docks
					// above it. Esc closes it from anywhere in the log.
					// biome-ignore lint/a11y/noStaticElementInteractions: Esc bubbles here from the focused row or record; the wrapper is no control itself
					<div
						data-testid="activity-layout"
						className={cn(
							"grid items-start gap-4",
							open && "xl:grid-cols-[minmax(0,1fr)_24rem]",
						)}
						onKeyDown={(event) => {
							if (event.key === "Escape" && open) {
								event.preventDefault();
								onSelect(undefined);
							}
						}}
					>
						<div className="min-w-0">
							{/* The audit table from md; below it, the two-line rows. */}
							<div className="hidden md:block">
								<AuditTable
									entries={entries}
									selectedId={selectedId}
									onSelect={onSelect}
									now={now}
								/>
							</div>
							<div className="px-4 md:hidden">
								<ActivityRows
									entries={entries}
									now={now}
									withRecordLinks
									byDay
								/>
							</div>
						</div>
						{open ? (
							<div
								data-testid="activity-record-dock"
								className="order-first min-w-0 px-4 xl:sticky xl:top-[calc(var(--topbar-height)+0.5rem)] xl:order-none xl:pl-0"
							>
								<DecisionRecord
									entry={entries.find((e) => e.id === selectedId)}
									selectedId={selectedId}
									onClose={() => onSelect(undefined)}
									now={now}
								/>
							</div>
						) : null}
					</div>
				);
			}}
		</Surface>
	);
}

/**
 * One row per entry: what happened and to which entity on the first line,
 * who and when on the second. Two lines, so the log reads on a phone.
 */
export function ActivityRows({
	entries,
	now,
	withRecordLinks = false,
	byDay = false,
	nested = false,
}: {
	entries: ActivityEntry[];
	now: number;
	/** On a phone, each row opens its decision record by a link. */
	withRecordLinks?: boolean;
	/** Under a heading per day, as the audit table is. */
	byDay?: boolean;
	/** One day's list inside the grouped rows: the test id is the group's. */
	nested?: boolean;
}) {
	if (byDay)
		return (
			<div data-testid="activity-rows" className="flex flex-col">
				{groupByDay(entries).map((group) => (
					<section
						key={group.day}
						aria-label={dayLabel(group.day, now)}
						data-testid={`activity-day-${group.day}`}
					>
						<h3 className="sticky top-(--topbar-height) z-10 -mx-4 border-b border-border bg-app-band px-4 py-1.5 type-eyebrow">
							{dayLabel(group.day, now)}
						</h3>
						<ActivityRows
							entries={group.entries}
							now={now}
							withRecordLinks={withRecordLinks}
							nested
						/>
					</section>
				))}
			</div>
		);
	return (
		<ol
			aria-label="Activity"
			data-testid={nested ? undefined : "activity-rows"}
			className="flex flex-col divide-y divide-border"
		>
			{entries.map((entry) => (
				<li
					key={entry.id}
					data-testid={`activity-row-${entry.id}`}
					className="flex flex-col gap-0.5 py-2"
				>
					<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
						<span
							data-testid={`activity-action-${entry.id}`}
							className="type-small font-medium text-foreground"
						>
							{ACTION_COPY[entry.action]}
						</span>
						<ActivityTarget entry={entry} />
					</span>
					<span className="flex items-center gap-2">
						<ActivityActor entry={entry} />
						<span aria-hidden="true" className="text-text-subtle">
							·
						</span>
						{/* Under a day heading the day is said, so the row gives the
						    clock; a list with no headings keeps the age. The exact
						    time is on hover either way. */}
						{nested ? (
							<ClockTime at={entry.at} id={entry.id} />
						) : (
							<time
								dateTime={entry.at}
								title={entry.at}
								data-testid={`activity-at-${entry.id}`}
								className="type-small text-text-subtle tabular-nums"
							>
								{relativeTime(entry.at, now)}
							</time>
						)}
						{withRecordLinks ? <RecordLink id={entry.id} /> : null}
					</span>
				</li>
			))}
		</ol>
	);
}

/**
 * Which entity the entry is about: its type, then its name when the entry
 * carries one, a link where the app has a page for it. Its id is never
 * shown; it stays on hover for support. A mission opens its own page; a client opens
 * selected on the Clients page. Other types have no page yet, so they are
 * plain text.
 */
export function ActivityTarget({
	entry,
}: {
	entry: Pick<
		ActivityEntry,
		"id" | "action" | "entityType" | "entityId" | "payload"
	>;
}) {
	const testId = `activity-target-${entry.id}`;
	// Underlined at rest, faintly, so a link reads apart from the plain text
	// beside it without hovering; hover brings the line to full strength. The
	// vertical padding, netted out by its margin, makes the hit area 24px
	// without moving the line (v3 UX 1).
	const linkClass =
		"py-1.5 -my-1.5 type-small text-text-muted underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-current";
	// An agent logs only its id: it is named from the catalog.
	if (entry.entityType === "agent_template")
		return <AgentTarget entry={entry} testId={testId} linkClass={linkClass} />;
	const name = entityNameOf(entry);
	const content = (
		<span title={entry.entityId}>
			{ENTITY_LABEL[entry.entityType]}
			{name ? ` ${name}` : null}
		</span>
	);
	switch (entry.entityType) {
		case "mission":
			return (
				<Link
					to="/missions/$id"
					params={{ id: entry.entityId }}
					data-testid={testId}
					className={linkClass}
				>
					{content}
				</Link>
			);
		case "client":
			return (
				<Link
					to="/clients/$id"
					params={{ id: entry.entityId }}
					data-testid={testId}
					className={linkClass}
				>
					{content}
				</Link>
			);
		default:
			return (
				<span data-testid={testId} className="type-small text-text-muted">
					{content}
				</span>
			);
	}
}

/** How much of the log is loaded, and a way to load the rest. */

/** Rows in the log's real shape: two lines each, a few of them. */
export function ActivityLogSkeleton() {
	return (
		<div
			data-testid="activity-log-skeleton"
			className="flex flex-col divide-y divide-border"
		>
			{[0, 1, 2, 3].map((i) => (
				<div
					key={i}
					data-testid="activity-log-skeleton-row"
					className="flex flex-col gap-1.5 py-3"
				>
					<span className="flex items-center gap-2">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3.5 w-24" />
					</span>
					<Skeleton className="h-3 w-32" />
				</div>
			))}
		</div>
	);
}
