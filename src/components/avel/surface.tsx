import {
	Check,
	CircleAlertIcon,
	CircleDashed,
	Copy,
	type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { useCopy } from "@/lib/clipboard";
import { describeError } from "@/lib/error-map";
import { EmptyState } from "./empty-state";
import { ReadAge } from "./read-age";

/**
 * The part of a query result <Surface> reads. A TanStack Query result is
 * assignable to it, and so is a plain object in a test.
 */
export type SurfaceQuery<TData, TError> =
	| { status: "pending" }
	| {
			status: "error";
			error: TError;
			refetch: () => unknown;
			isFetching: boolean;
	  }
	| {
			status: "success";
			data: TData;
			/** When the data was read, for `freshness`. */
			dataUpdatedAt?: number;
			refetch?: () => unknown;
			isFetching?: boolean;
	  };

export type ErrorStateProps<TError> = {
	error: TError;
	/** Absent where there is nothing to send again: no Try again then. */
	retry?: () => void;
	retrying?: boolean;
};

// An array is empty when it has no items. Anything else, such as a page with
// a cursor, has to say what empty means, so forgetting is a type error rather
// than a list that never shows its empty state.
type EmptyTest<TData> = TData extends readonly unknown[]
	? { isEmpty?: (data: TData) => boolean }
	: { isEmpty: (data: TData) => boolean };

type DataSurfaceProps<TData, TError> = {
	query: SurfaceQuery<TData, TError>;
	/** A skeleton in the content's real shape. Never a spinner. */
	loading: ReactNode;
	/** Why the region is empty and what to do next. */
	empty: ReactNode;
	/** Usually `ErrorState`, which renders copy from `src/lib/error-map.ts`. */
	error: ComponentType<ErrorStateProps<TError>>;
	children: (data: TData) => ReactNode;
	"data-testid": string;
	/**
	 * Says when the data was read, and past `staleAfterMs` (default: the
	 * query client's stale time) marks it stale with Refresh (audit F1).
	 * Needs the query's dataUpdatedAt and refetch.
	 */
	freshness?: { staleAfterMs?: number };
	notBuilt?: never;
} & EmptyTest<TData>;

export type NotBuiltCopy = {
	title: string;
	what: string;
	needs: readonly string[];
	icon?: LucideIcon;
	/** For a popover or panel. */
	compact?: boolean;
	/**
	 * "inline": one line, for a narrow column where a centred block would
	 * dominate: the dashed glyph, a "Not built" badge and `line` (else the
	 * title), with `what` in the tooltip and read out.
	 */
	size?: "block" | "inline";
	/** The inline size's words, short enough for one line. */
	line?: string;
};

type NotBuiltSurfaceProps = {
	/**
	 * For a region whose endpoint does not exist. `title` says what will live
	 * here, `what` states the absence in a sentence or two, and `needs` names
	 * the contract routes it waits on, as the docs name them (empty when no doc
	 * names one). `icon` is usually the route's icon from nav.ts.
	 */
	notBuilt: NotBuiltCopy;
	"data-testid": string;
	query?: never;
	loading?: never;
	empty?: never;
	error?: never;
	children?: never;
	freshness?: never;
};

export type SurfaceProps<TData, TError> =
	| DataSurfaceProps<TData, TError>
	| NotBuiltSurfaceProps;

/**
 * Every data region renders through this (AVEL-DESIGN.md section 8).
 * Loading, empty, error and success are required props, so a missing state
 * is a type error. A region with no endpoint renders `notBuilt` instead and
 * takes none of the four, because there is no data to type them against.
 *
 * The wrapper carries the caller's `data-testid` and `data-state`, one of
 * loading, empty, error, success or not-built.
 */
export function Surface<TData, TError>(props: SurfaceProps<TData, TError>) {
	const testId = props["data-testid"];

	if (props.notBuilt !== undefined) {
		return (
			<div
				data-testid={testId}
				data-state="not-built"
				className={
					props.notBuilt.size === "inline" ? undefined : "flex flex-1 flex-col"
				}
			>
				<NotBuilt {...props.notBuilt} />
			</div>
		);
	}

	const { query } = props;
	switch (query.status) {
		case "pending":
			return (
				<div data-testid={testId} data-state="loading" aria-busy="true">
					{props.loading}
				</div>
			);
		case "error": {
			const ErrorView = props.error;
			return (
				<div data-testid={testId} data-state="error">
					<ErrorView
						error={query.error}
						retry={() => {
							query.refetch();
						}}
						retrying={query.isFetching}
					/>
				</div>
			);
		}
		case "success": {
			const isEmpty =
				props.isEmpty ??
				((data: TData) => Array.isArray(data) && data.length === 0);
			const state = isEmpty(query.data) ? "empty" : "success";
			const { freshness } = props;
			const { dataUpdatedAt, refetch } = query;
			return (
				<div data-testid={testId} data-state={state}>
					{state === "empty" ? props.empty : props.children(query.data)}
					{freshness && dataUpdatedAt && refetch ? (
						<ReadAge
							data-testid={`${testId}-read-age`}
							readAt={dataUpdatedAt}
							staleAfterMs={freshness.staleAfterMs ?? QUERY_STALE_MS}
							onRefresh={() => {
								refetch();
							}}
							refreshing={query.isFetching}
							className="justify-end px-1 pt-2"
						/>
					) : null}
				</div>
			);
		}
	}
}

/**
 * The fifth state: a centred empty state whose eyebrow says "Not built", so
 * the absence is stated in words above what will live here. It draws no box
 * around the region; a solid border bounds only something real.
 */
function NotBuilt({
	title,
	what,
	needs,
	icon,
	compact,
	size,
	line,
}: NotBuiltCopy) {
	const Icon = icon ?? CircleDashed;
	if (size === "inline")
		return (
			<p
				data-testid="surface-not-built"
				title={what}
				className="flex flex-wrap items-center gap-1.5 type-small text-text-muted"
			>
				<Icon
					aria-hidden="true"
					className="size-3.5 shrink-0 text-text-subtle"
				/>
				<Badge variant="outline">Not built</Badge>
				<span className="whitespace-nowrap">{line ?? title}</span>
				<span className="sr-only">{what}</span>
			</p>
		);
	return (
		<EmptyState
			data-testid="surface-not-built"
			icon={icon ?? CircleDashed}
			eyebrow="Not built"
			title={title}
			description={what}
			needs={needs}
			compact={compact}
		/>
	);
}

/**
 * The standard error view for anything fetched through `src/lib/api`. It says
 * what happened, whether anything was written, and what to do. Try again
 * appears only when the error map says retrying could change the result.
 *
 * It is v3's couldn't-load box (UX 8): the block tone's soft ground and line,
 * the glyph beside the copy. Under the copy it shows the envelope's error code
 * and the request id in mono (audit D10, F4), so a report can be traced to
 * its log line; each appears only when the server sent it.
 */
export function ErrorState({
	error,
	retry,
	retrying,
}: ErrorStateProps<ApiError>) {
	const copy = describeError(error);
	return (
		<div
			role="alert"
			data-testid="surface-error"
			className="flex items-start gap-2.5 rounded-control border border-gate-block-line bg-gate-block-soft p-3"
		>
			<CircleAlertIcon
				aria-hidden="true"
				className="mt-px size-4 shrink-0 text-gate-block"
			/>
			<div className="flex min-w-0 flex-col items-start gap-1">
				<p className="type-body font-medium text-text">{copy.what}</p>
				<p className="type-small text-text-muted">{copy.written}</p>
				<p className="type-small text-text-muted">{copy.next}</p>
				{error.failure.kind === "contract" ? (
					<div
						data-testid="surface-error-code"
						className="flex flex-wrap items-center gap-x-2"
					>
						<span className="type-caption text-text-subtle">Error code</span>
						<code className="type-mono break-all text-text-muted">
							{error.failure.code}
						</code>
					</div>
				) : null}
				{error.requestId ? <RequestReference id={error.requestId} /> : null}
				{copy.retry && retry ? (
					<Button
						variant="outline"
						size="sm"
						onClick={retry}
						disabled={retrying}
						data-testid="surface-error-retry"
						className="mt-1.5"
					>
						{retrying ? "Trying again" : "Try again"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

/**
 * The id support needs to find the request in the server's logs. It is
 * content, so it is shown whole and wraps rather than truncates (section 12),
 * and Copy copies the full value. A polite live region says whether the copy
 * worked; the clipboard can be unavailable, and that is said too.
 */
export function RequestReference({ id }: { id: string }) {
	const { status, copy: copyId } = useCopy();
	const copy = () => copyId(id);
	return (
		<div
			data-testid="surface-error-reference"
			className="flex flex-wrap items-center gap-x-2 gap-y-1"
		>
			<span className="type-caption text-text-subtle">Request reference</span>
			<code
				data-testid="surface-error-request-id"
				className="type-mono min-w-0 break-all text-text-muted"
			>
				{id}
			</code>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Copy request reference"
				data-testid="surface-error-copy"
				onClick={copy}
			>
				{status === "Copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
			</Button>
			<span
				aria-live="polite"
				data-testid="surface-error-copy-status"
				className="sr-only"
			>
				{status}
			</span>
		</div>
	);
}
