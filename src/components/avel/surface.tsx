import {
	Check,
	CircleAlertIcon,
	CircleDashed,
	Copy,
	type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { useCopy } from "@/lib/clipboard";
import { describeError } from "@/lib/error-map";
import { EmptyState } from "./empty-state";

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
	| { status: "success"; data: TData };

export type ErrorStateProps<TError> = {
	error: TError;
	retry: () => void;
	retrying: boolean;
};

/** Every value `data-state` takes on a surface. */
export type SurfaceState =
	| "loading"
	| "empty"
	| "error"
	| "success"
	| "not-built";

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
	notBuilt?: never;
} & EmptyTest<TData>;

export type NotBuiltCopy = {
	title: string;
	what: string;
	needs: readonly string[];
	icon?: LucideIcon;
	/** For a popover or panel. */
	compact?: boolean;
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
				className="flex flex-1 flex-col"
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
			return (
				<div data-testid={testId} data-state={state}>
					{state === "empty" ? props.empty : props.children(query.data)}
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
function NotBuilt({ title, what, needs, icon, compact }: NotBuiltCopy) {
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
			className="flex flex-col items-start gap-2 surface-steel rounded-md border border-gate-block-line bg-app-panel p-6"
		>
			<p className="type-body flex items-center gap-2 font-medium text-foreground">
				<CircleAlertIcon
					aria-hidden="true"
					className="size-4 text-gate-block"
				/>
				{copy.what}
			</p>
			<p className="type-small text-text-muted">{copy.written}</p>
			<p className="type-small text-text-muted">{copy.next}</p>
			{error.requestId ? <RequestReference id={error.requestId} /> : null}
			{copy.retry ? (
				<Button
					variant="outline"
					size="sm"
					onClick={retry}
					disabled={retrying}
					data-testid="surface-error-retry"
				>
					{retrying ? "Trying again" : "Try again"}
				</Button>
			) : null}
		</div>
	);
}

/**
 * The id support needs to find the request in the server's logs. It is
 * content, so it is shown whole and wraps rather than truncates (section 12),
 * and Copy copies the full value. A polite live region says whether the copy
 * worked; the clipboard can be unavailable, and that is said too.
 */
function RequestReference({ id }: { id: string }) {
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
				className="type-mono-small min-w-0 break-all text-text-muted"
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
