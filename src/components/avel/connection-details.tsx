import { useInfiniteQuery } from "@tanstack/react-query";
import type { Connection } from "avel-server/contract";
import type { ReactNode } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import { entitiesActivityQuery, loadedActivity } from "@/lib/api/activity";
import { isoDate } from "@/lib/api/clients";
import {
	CONNECTION_SCOPE,
	CONNECTION_SERVICE,
	CONNECTION_STATUS,
	useConnection,
} from "@/lib/api/connections";
import { actionLabel } from "./activity-copy";
import { whenLabel } from "./agent-activity";
import { EngagementLink } from "./connection-list";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * One connection's details, a sheet over the Connections page, named by the
 * URL's `connection` so it is a link (GET /api/connections/:id). It opens at
 * once from the list's copy, then reads on its own. It shows every field,
 * what the connection is for and what goes through it, and its history.
 * The token is never shown: only the name of the variable that holds it.
 */

export function ConnectionDetails({
	id,
	onClose,
}: {
	id: string;
	onClose: () => void;
}) {
	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				data-testid="connection-details"
				className="w-full gap-0 p-0 sm:max-w-md"
			>
				<ConnectionDetailsBody id={id} />
			</SheetContent>
		</Sheet>
	);
}

/** The sheet's contents, in the four states every data region has. */
export function ConnectionDetailsBody({ id }: { id: string }) {
	const connection = useConnection(id);
	return (
		<>
			<SheetHeader>
				<SheetTitle data-testid="connection-details-title">
					{connection.data?.label ?? "Connection"}
				</SheetTitle>
				<SheetDescription>
					A GitHub account AVEL may read and deliver through.
				</SheetDescription>
			</SheetHeader>
			<div className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
				<Surface
					data-testid="connection-details-body"
					query={connection}
					// A connection exists or it is not found; it is never empty.
					isEmpty={() => false}
					empty={null}
					loading={<DetailsSkeleton />}
					error={ErrorState}
				>
					{(data) => <ConnectionFacts connection={data} />}
				</Surface>
			</div>
		</>
	);
}

function DetailsSkeleton() {
	return (
		<div
			data-testid="connection-details-skeleton"
			className="flex flex-col gap-3"
		>
			<Skeleton className="h-5 w-20 rounded-sm" />
			<Skeleton className="h-4 w-3/4" />
			<Skeleton className="h-4 w-1/2" />
			<Skeleton className="h-4 w-2/3" />
		</div>
	);
}

/** A date field, or a dash when the connection has none. */
function DateValue({ iso, testId }: { iso: string | null; testId: string }) {
	return iso === null ? (
		<span data-testid={testId} className="text-text-subtle">
			None
		</span>
	) : (
		<time data-testid={testId} dateTime={iso} className="type-mono text-text">
			{isoDate(iso)}
		</time>
	);
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-text-subtle">{term}</dt>
			<dd className="min-w-0">{children}</dd>
		</>
	);
}

/** Every field, what it is for, and its history. */
export function ConnectionFacts({ connection }: { connection: Connection }) {
	const { tone, label } = CONNECTION_STATUS[connection.status];
	return (
		<div data-testid="connection-details-facts" className="flex flex-col gap-6">
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 type-small">
				<Fact term="Status">
					<StatusPill
						size="sm"
						tone={tone}
						label={label}
						data-testid="connection-details-status"
					/>
				</Fact>
				<Fact term="Service">
					<span className="text-text">
						{CONNECTION_SERVICE[connection.service]}
					</span>
				</Fact>
				<Fact term={CONNECTION_SCOPE[connection.scopeType]}>
					<span
						data-testid="connection-details-scope"
						className="break-all type-mono text-text"
					>
						{connection.scopeValue}
					</span>
				</Fact>
				<Fact term="Token in">
					{/* The variable's name, never its value (contract: credentialRef). */}
					<code
						data-testid="connection-details-credential"
						className="break-all type-mono text-text"
					>
						{connection.credentialRef}
					</code>
					<p className="type-caption text-text-muted">
						The environment variable on the server that holds the token. AVEL
						reads it when the connection is used and never stores or shows the
						token.
					</p>
				</Fact>
				<Fact term="Created">
					<DateValue
						iso={connection.createdAt}
						testId="connection-details-created"
					/>
				</Fact>
				<Fact term="Expires">
					<DateValue
						iso={connection.expiresAt}
						testId="connection-details-expires"
					/>
				</Fact>
				<Fact term="Rotated">
					<DateValue
						iso={connection.lastRotatedAt}
						testId="connection-details-rotated"
					/>
				</Fact>
				{connection.revokedAt === null ? null : (
					<Fact term="Revoked">
						<DateValue
							iso={connection.revokedAt}
							testId="connection-details-revoked"
						/>
					</Fact>
				)}
			</dl>
			<UsedBy connection={connection} />
			<History id={connection.id} />
		</div>
	);
}

/**
 * What goes through it. A connection belongs to one engagement, or to
 * AVEL's own work; that engagement's repository reads and deliveries use
 * its active connections, so a revoked or expired one is refused.
 */
function UsedBy({ connection }: { connection: Connection }) {
	const live = connection.status === "active";
	return (
		<section
			aria-labelledby="connection-details-used"
			data-testid="connection-details-used"
			className="flex flex-col gap-2"
		>
			<h3 id="connection-details-used" className="type-eyebrow">
				What uses it
			</h3>
			<p className="type-small text-text">
				<EngagementLink
					engagementId={connection.engagementId}
					testId="connection-details-engagement"
				/>
			</p>
			<p
				data-testid="connection-details-used-line"
				className="type-small text-text-muted"
			>
				{connection.engagementId === null
					? "AVEL's internal missions read and deliver through it."
					: "This engagement's intakes read their repository through it, and its missions deliver through it."}{" "}
				{live
					? `Each use is limited to ${connection.scopeValue}.`
					: "It is not active, so any use of it is refused."}
			</p>
		</section>
	);
}

/** How many history rows the sheet shows: the connection's few events. */
const HISTORY_LIMIT = 10;

/** Its own activity rows: added, and revoked when an engagement closed. */
function History({ id }: { id: string }) {
	const history = useInfiniteQuery(
		entitiesActivityQuery(useApiClient(), "connection", [id], HISTORY_LIMIT),
	);
	return (
		<section
			aria-labelledby="connection-details-history"
			className="flex flex-col gap-2"
		>
			<h3 id="connection-details-history" className="type-eyebrow">
				History
			</h3>
			<Surface
				data-testid="connection-details-history"
				query={history}
				isEmpty={(data) => loadedActivity(data).length === 0}
				loading={<Skeleton className="h-4 w-2/3" />}
				empty={
					<p className="type-small text-text-subtle">Nothing recorded yet.</p>
				}
				error={ErrorState}
			>
				{(data) => (
					<ol className="flex flex-col gap-1.5">
						{loadedActivity(data).map((entry) => (
							<li
								key={entry.id}
								data-testid={`connection-details-history-${entry.id}`}
								className="flex flex-wrap items-baseline gap-x-2 type-small"
							>
								<span className="text-text">{actionLabel(entry.action)}</span>
								<span className="text-text-muted">{entry.actor.display}</span>
								<time
									dateTime={entry.at}
									className="ml-auto type-mono text-text-subtle"
								>
									{whenLabel(entry.at)}
								</time>
							</li>
						))}
					</ol>
				)}
			</Surface>
		</section>
	);
}
