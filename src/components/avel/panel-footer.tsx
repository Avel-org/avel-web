import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { ReadAge } from "./read-age";

/*
 * What every list panel's footer band holds (DataPanel `footer`): when its
 * data was read on the left, and its paging (Showing N of M, Load more) or
 * its "All …" link on the right. One shape, so every page reads the same.
 */

/** The parts of one or more queries the read age needs. */
export type ReadQuery = {
	status: "pending" | "error" | "success";
	dataUpdatedAt: number;
	isFetching: boolean;
	refetch: () => unknown;
};

/**
 * A panel's footer: the read age of its queries (the oldest that has read,
 * so the age never flatters) and `children` on the right. Nothing until one
 * has read.
 */
export function PanelFooter({
	queries,
	"data-testid": testId,
	children,
}: {
	queries: readonly ReadQuery[];
	"data-testid": string;
	children?: ReactNode;
}) {
	const read = queries.filter(
		(q) => q.status === "success" && q.dataUpdatedAt > 0,
	);
	if (read.length === 0) return children ? <span /> : null;
	return (
		<>
			<ReadAge
				data-testid={testId}
				readAt={Math.min(...read.map((q) => q.dataUpdatedAt))}
				staleAfterMs={QUERY_STALE_MS}
				onRefresh={() => {
					for (const q of read) q.refetch();
				}}
				refreshing={read.some((q) => q.isFetching)}
			/>
			{children ? (
				<span className="flex items-center gap-2">{children}</span>
			) : null}
		</>
	);
}

/** "Showing 12 of 40" and Load more, for a footer's right side. */
export function Paging({
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
	testIdPrefix,
}: {
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	/** `${prefix}-showing` and `${prefix}-load-more`. */
	testIdPrefix: string;
}) {
	return (
		<>
			{total === undefined ? null : (
				<span
					data-testid={`${testIdPrefix}-showing`}
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${loaded} of ${total}`}
				</span>
			)}
			{hasMore ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid={`${testIdPrefix}-load-more`}
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
		</>
	);
}
