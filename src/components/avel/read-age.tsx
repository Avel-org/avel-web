import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/api/clients";
import { DISPATCH_POLL_MS } from "@/lib/api/dispatches";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { StatusGlyph } from "./status-pill";

/*
 * How fresh a region's data is (design and data flow audit, F1). Only
 * dispatch reads poll; every other region is read once and again only on
 * focus, a refetch or a write. So a region says when it was read, and past
 * its threshold it says the value is stale and offers Refresh, instead of a
 * mission reading "active" after the runner halted it. It never says "Live".
 */

/** How a polling region describes itself. */
export type Polling = "polling" | "final";

/** "Read just now", "Read 4 minutes ago". */
export function readAgeLabel(readAt: number, now: number): string {
	// A clock a little ahead of the server's reads as just now, never "in 2 s".
	const at = Math.min(readAt, now);
	return `Read ${relativeTime(new Date(at).toISOString(), now)}`;
}

/** True once the data is older than the region's threshold. */
export function isStale(
	readAt: number,
	now: number,
	staleAfterMs: number,
): boolean {
	return now - readAt > staleAfterMs;
}

/** What a polling region says: while it polls, and once it has stopped. */
export function pollingLabel(polling: Polling): string {
	return polling === "polling"
		? `Updating every ${DISPATCH_POLL_MS / 1000} s while a dispatch runs`
		: "Final";
}

export function ReadAge({
	readAt,
	staleAfterMs,
	onRefresh,
	refreshing = false,
	polling,
	className,
	"data-testid": testId = "read-age",
}: {
	/** When the data was read: the query's dataUpdatedAt. */
	readAt: number;
	staleAfterMs: number;
	onRefresh: () => void;
	refreshing?: boolean;
	/** Set only on a region that polls. A polling region is never stale. */
	polling?: Polling;
	className?: string;
	"data-testid"?: string;
}) {
	const now = useNow();
	if (polling === "polling")
		return (
			<p
				data-testid={testId}
				data-polling="true"
				className={cn("type-caption text-text-subtle", className)}
			>
				{pollingLabel(polling)}
			</p>
		);
	const stale = isStale(readAt, now, staleAfterMs);
	const label =
		polling === "final"
			? `${pollingLabel(polling)}, ${readAgeLabel(readAt, now).toLowerCase()}`
			: readAgeLabel(readAt, now);
	return (
		<div
			data-testid={testId}
			data-stale={stale}
			className={cn(
				"flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-text-subtle",
				className,
			)}
		>
			{stale ? <StatusGlyph tone="stale" /> : null}
			<span>
				{label}
				{stale ? <span className="sr-only">, may be out of date</span> : null}
			</span>
			{stale ? (
				<Button
					variant="link"
					size="sm"
					onClick={onRefresh}
					disabled={refreshing}
					data-testid={`${testId}-refresh`}
				>
					{refreshing ? "Refreshing" : "Refresh"}
				</Button>
			) : null}
		</div>
	);
}
