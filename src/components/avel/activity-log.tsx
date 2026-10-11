import { Link } from "@tanstack/react-router";
import type { ActivityEntry } from "avel-server/contract";
import { History, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedActivity, type useActivity } from "@/lib/api/activity";
import { relativeTime } from "@/lib/api/clients";
import { ActivityActor } from "./activity-actor";
import { AuditTable, DecisionRecord, RecordLink } from "./activity-audit";
import { ACTION_COPY, ENTITY_LABEL } from "./activity-copy";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";

/** The first eight characters of an id: a mission's short name everywhere. */
const short = (id: string) => id.slice(0, 8);

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
				return (
					<div className="flex flex-col gap-4">
						{/* The audit table from md; below it, the two-line rows. */}
						<div className="hidden md:block">
							<AuditTable
								entries={entries}
								selectedId={selectedId}
								onSelect={onSelect}
								now={now}
							/>
						</div>
						<div className="md:hidden">
							<ActivityRows entries={entries} now={now} withRecordLinks />
						</div>
						<DecisionRecord
							entry={entries.find((e) => e.id === selectedId)}
							selectedId={selectedId}
							onClose={() => onSelect(undefined)}
						/>
						<ActivityFooter
							loaded={entries.length}
							total={data.pages[0]?.meta.total}
							hasMore={query.hasNextPage}
							loadingMore={query.isFetchingNextPage}
							onLoadMore={() => query.fetchNextPage()}
						/>
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
}: {
	entries: ActivityEntry[];
	now: number;
	/** On a phone, each row opens its decision record by a link. */
	withRecordLinks?: boolean;
}) {
	return (
		<ol
			aria-label="Activity"
			data-testid="activity-rows"
			className="flex flex-col divide-y divide-border"
		>
			{entries.map((entry) => (
				<li
					key={entry.id}
					data-testid={`activity-row-${entry.id}`}
					className="flex flex-col gap-1 py-3"
				>
					<span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<span
							data-testid={`activity-action-${entry.id}`}
							className="type-body font-medium text-foreground"
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
						{/* The exact time on hover, as the mission list does. */}
						<time
							dateTime={entry.at}
							title={entry.at}
							data-testid={`activity-at-${entry.id}`}
							className="type-small text-text-subtle tabular-nums"
						>
							{relativeTime(entry.at, now)}
						</time>
						{withRecordLinks ? <RecordLink id={entry.id} /> : null}
					</span>
				</li>
			))}
		</ol>
	);
}

/**
 * Which entity the entry is about: its type and short id, a link where the
 * app has a page for it. A mission opens its own page; a client opens
 * selected on the Clients page. Other types have no page yet, so they are
 * plain text.
 */
export function ActivityTarget({
	entry,
}: {
	entry: Pick<ActivityEntry, "id" | "entityType" | "entityId">;
}) {
	const testId = `activity-target-${entry.id}`;
	const content = (
		<>
			{ENTITY_LABEL[entry.entityType]}{" "}
			<span className="type-mono-small">{short(entry.entityId)}</span>
		</>
	);
	// Underlined at rest, faintly, so a link reads apart from the plain text
	// beside it without hovering; hover brings the line to full strength.
	const linkClass =
		"type-small text-text-muted underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-current";
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
					to="/clients"
					search={{ client: entry.entityId }}
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
function ActivityFooter({
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
}: {
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
}) {
	if (total === undefined && !hasMore) return null;
	return (
		<div className="flex items-center justify-between gap-2">
			{total === undefined ? (
				<span />
			) : (
				<p
					data-testid="activity-showing"
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${loaded} of ${total}`}
				</p>
			)}
			{hasMore ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid="activity-load-more"
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
		</div>
	);
}

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
