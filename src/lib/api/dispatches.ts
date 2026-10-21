import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CompletionReport,
	type CreateDispatchBody,
	contract,
	type Dispatch,
	type DispatchStatus,
	MAX_PAGE_SIZE,
} from "avel-server/contract";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Dispatches and their completion reports (modules 6 and 8). A mission's
 * lists are read whole, every page, and polled while anything is still in
 * motion, so the board moves without a reload.
 */

/** How often a mission with a queued or running dispatch reads again. */
export const DISPATCH_POLL_MS = 5_000;

/** A safety stop for reading every page: 20 pages of 100. */
const MAX_PAGES = 20;

/** Every page of a cursor list, in order. */
async function allPages<T>(
	page: (cursor: string | undefined) => Promise<{
		data: T[];
		meta: { nextCursor: string | null };
	}>,
): Promise<T[]> {
	const rows: T[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < MAX_PAGES; i++) {
		const { data, meta } = await page(cursor);
		rows.push(...data);
		if (!meta.nextCursor) break;
		cursor = meta.nextCursor;
	}
	return rows;
}

/** True while a dispatch can still change on its own: waiting or running. */
export function inMotion(dispatches: readonly Dispatch[] | undefined): boolean {
	return (dispatches ?? []).some(
		(d) => d.status === "queued" || d.status === "running",
	);
}

/** The poll interval for a mission's reads: on while anything moves, off after. */
export function pollWhile(moving: boolean): number | false {
	return moving ? DISPATCH_POLL_MS : false;
}

export function missionDispatchesQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.list(missionId),
		queryFn: () =>
			allPages<Dispatch>((cursor) =>
				callPage(contract.dispatches.list, () =>
					api.dispatches.list({
						params: { id: missionId },
						query: { limit: MAX_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
					}),
				),
			),
		// Polls itself while a dispatch is waiting or running, and stops once
		// none is: the interval is read from the latest answer.
		refetchInterval: (query) => pollWhile(inMotion(query.state.data)),
	});
}

/**
 * A mission's queued and running dispatches only: two status-filtered reads,
 * not its whole history, for the Missions dashboard. It polls while either
 * holds a row, and stops once both are empty.
 */
export function movingDispatchesQuery(api: ApiClient, missionId: string) {
	const page = (status: "queued" | "running") =>
		callPage(contract.dispatches.list, () =>
			api.dispatches.list({
				params: { id: missionId },
				query: { limit: MAX_PAGE_SIZE, status },
			}),
		).then((p) => p.data);
	return queryOptions({
		queryKey: queryKeys.dispatches.moving(missionId),
		queryFn: async () => {
			const [running, queued] = await Promise.all([
				page("running"),
				page("queued"),
			]);
			return [...running, ...queued];
		},
		refetchInterval: (query) => pollWhile(inMotion(query.state.data)),
	});
}

/** Every dispatch on the mission, newest first. */
export function useMissionDispatches(missionId: string) {
	return useQuery(missionDispatchesQuery(useApiClient(), missionId));
}

export function dispatchQuery(api: ApiClient, missionId: string, id: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.detail(missionId, id),
		queryFn: () =>
			call(contract.dispatches.get, () =>
				api.dispatches.get({ params: { id } }),
			),
		// Polls itself while it waits or runs, as the mission's list does, so
		// an open dispatch stays live with no list behind it.
		refetchInterval: (query) =>
			pollWhile(query.state.data ? inMotion([query.state.data]) : false),
	});
}

/**
 * contract.dispatches.get: one dispatch, for the view that opens it. Seeded
 * from the mission's list when that holds it, as old as the list's read, so
 * nothing flashes; then it reads on its own, and works deep-linked.
 */
export function useDispatch(missionId: string, id: string) {
	const queryClient = useQueryClient();
	const listKey = queryKeys.dispatches.list(missionId);
	return useQuery({
		...dispatchQuery(useApiClient(), missionId, id),
		initialData: () =>
			queryClient.getQueryData<Dispatch[]>(listKey)?.find((d) => d.id === id),
		initialDataUpdatedAt: () =>
			queryClient.getQueryState(listKey)?.dataUpdatedAt,
	});
}

/**
 * What is in motion across several missions, for the Missions dashboard.
 * There is no cross-mission dispatch route, so it reads each mission's
 * queued and running dispatches (movingDispatchesQuery, two small
 * status-filtered reads, never the whole history), and each polls itself
 * while one is queued or running. Nothing
 * here is pushed: `polling` says whether any list is still being re-read,
 * so the page can say "Updating every 5 s" and, after, "Final" (audit F1).
 */
export type LiveDispatches = {
	/** Queued and running dispatches, running first, newest first within. */
	moving: Dispatch[];
	/** True while any mission's list is re-read every DISPATCH_POLL_MS. */
	polling: boolean;
	/** The oldest read among the lists, so the age never flatters. 0 if none. */
	readAt: number;
	status: "pending" | "error" | "success";
	refetch: () => void;
	isFetching: boolean;
};

/** One mission list's read, as the merge needs it. */
type ListRead = {
	data?: Dispatch[];
	dataUpdatedAt: number;
	status: "pending" | "error" | "success";
	isFetching: boolean;
	refetch: () => unknown;
};

/** Merges each mission's dispatch read into one live view. Pure, so it tests. */
export function liveOf(results: readonly ListRead[]): LiveDispatches {
	const moving = results
		.flatMap((r) => r.data ?? [])
		.filter((d) => d.status === "queued" || d.status === "running")
		.sort(
			(a, b) =>
				Number(b.status === "running") - Number(a.status === "running") ||
				b.createdAt.localeCompare(a.createdAt),
		);
	const read = results.map((r) => r.dataUpdatedAt).filter((at) => at > 0);
	return {
		moving,
		polling: results.some((r) => inMotion(r.data)),
		readAt: read.length ? Math.min(...read) : 0,
		status: results.some((r) => r.status === "error")
			? "error"
			: results.some((r) => r.status === "pending")
				? "pending"
				: "success",
		refetch: () => {
			for (const r of results) r.refetch();
		},
		isFetching: results.some((r) => r.isFetching),
	};
}

export function useLiveDispatches(
	missionIds: readonly string[],
): LiveDispatches {
	const api = useApiClient();
	return useQueries({
		queries: missionIds.map((id) => movingDispatchesQuery(api, id)),
		combine: liveOf,
	});
}

export function missionReportsQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.reports(missionId),
		queryFn: () =>
			allPages<CompletionReport>((cursor) =>
				callPage(contract.dispatches.reports, () =>
					api.dispatches.reports({
						params: { id: missionId },
						query: { limit: MAX_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
					}),
				),
			),
	});
}

/**
 * Every completion report on the mission. A report lands when a dispatch
 * closes, so `poll` (true while a dispatch moves) keeps it reading too.
 */
export function useMissionReports(missionId: string, poll = false) {
	return useQuery({
		...missionReportsQuery(useApiClient(), missionId),
		refetchInterval: pollWhile(poll),
	});
}

export function completionReportQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.report(id),
		queryFn: () =>
			call(contract.dispatches.report, () =>
				api.dispatches.report({ params: { id } }),
			),
		// A filed report is never changed.
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useCompletionReport(id: string) {
	return useQuery(completionReportQuery(useApiClient(), id));
}

export function dispatchBriefQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.brief(id),
		queryFn: () =>
			call(contract.dispatches.brief, () =>
				api.dispatches.brief({ params: { id } }),
			),
		// Read only once a dispatch has started, when its brief is frozen.
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** The brief a dispatch started with: its text and hash (step 9). */
export function useDispatchBrief(id: string) {
	return useQuery(dispatchBriefQuery(useApiClient(), id));
}

// ---------------------------------------------------------------------------
// One agent template's dispatches, across missions.

/** How many of a template's dispatches a page holds. */
export const TEMPLATE_DISPATCH_PAGE_SIZE = 50;

/**
 * A template's dispatches, newest first, a page at a time, each with its
 * mission and report summary. meta.totals counts what the status filter
 * keeps on every page, whatever the cursor. While a loaded dispatch
 * waits or runs, the list reads again.
 */
export function templateDispatchesQuery(
	api: ApiClient,
	templateId: string,
	status: DispatchStatus | null = null,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.dispatches.byTemplate(templateId, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.agentTemplates.dispatches, () =>
				api.agentTemplates.dispatches({
					params: { id: templateId },
					query: {
						limit: TEMPLATE_DISPATCH_PAGE_SIZE,
						...(status ? { status } : {}),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
		refetchInterval: (query) =>
			pollWhile(inMotion(query.state.data?.pages.flatMap((p) => p.data))),
	});
}

export function useTemplateDispatches(
	templateId: string,
	status: DispatchStatus | null = null,
) {
	return useInfiniteQuery(
		templateDispatchesQuery(useApiClient(), templateId, status),
	);
}

// ---------------------------------------------------------------------------
// Queueing a dispatch.

/** One submit attempt: its body and the Idempotency-Key it goes out with. */
export type DispatchAttempt = { key: string; body: CreateDispatchBody };

/** Same body, field for field: what makes a second send a retry. */
function sameBody(a: CreateDispatchBody, b: CreateDispatchBody): boolean {
	return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(body: CreateDispatchBody) {
	return {
		rosterEntryId: body.rosterEntryId,
		briefRef: {
			moduleId: body.briefRef.moduleId,
			requirementIds: [...body.briefRef.requirementIds],
		},
		estimatedTokens: body.estimatedTokens ?? null,
		tokenSoftCeiling: body.tokenSoftCeiling ?? null,
		tokenHardCeiling: body.tokenHardCeiling ?? null,
		wallClockMinutes: body.wallClockMinutes ?? null,
	};
}

/**
 * The attempt to send. Sending the same body again after a failure is a
 * retry of that attempt and keeps its key, so a write that landed before
 * the connection dropped replays instead of queueing twice. A changed body,
 * or the first send (`last` null, cleared after a success), is a new
 * attempt with a fresh key. avel-server stores a key only with the dispatch
 * it created, so reusing one after a refusal is safe.
 */
export function attemptFor(
	last: DispatchAttempt | null,
	body: CreateDispatchBody,
	freshKey: () => string = () => crypto.randomUUID(),
): DispatchAttempt {
	return last && sameBody(last.body, body) ? last : { key: freshKey(), body };
}

export function createDispatchRequest(
	api: ApiClient,
	missionId: string,
	{ key, body }: DispatchAttempt,
) {
	return call(contract.dispatches.create, () =>
		api.dispatches.create({
			params: { id: missionId },
			headers: { "idempotency-key": key },
			body,
		}),
	);
}

/**
 * A new dispatch shows on the board, moves the mission's counts and logs an
 * activity row: the mission's detail (with its dispatches and reports under
 * it) and the log read again.
 */
export function afterDispatchCreated(
	queryClient: QueryClient,
	missionId: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.missions.detail(missionId),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.dispatches.byTemplateAll(),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function useCreateDispatch(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (attempt: DispatchAttempt) =>
			createDispatchRequest(api, missionId, attempt),
		onSuccess: () => afterDispatchCreated(queryClient, missionId),
	});
}

// ---------------------------------------------------------------------------
// Starting and halting a dispatch.

/** POST start: queued to running, or refused with the first check that failed. */
export function startDispatchRequest(api: ApiClient, id: string) {
	return call(contract.dispatches.start, () =>
		api.dispatches.start({ params: { id } }),
	);
}

/** POST halt: running to halted, by the operator; the system files its report. */
export function haltDispatchRequest(api: ApiClient, id: string) {
	return call(contract.dispatches.halt, () =>
		api.dispatches.halt({ params: { id } }),
	);
}

/**
 * A started or halted dispatch changes lanes, moves the mission's spend,
 * files a report (a halt) and logs an activity row: the mission's detail
 * (its dispatches, each one read alone, its reports and live reads, all
 * under it), its agent's list across missions and the log read again.
 */
export function afterDispatchMoved(
	queryClient: QueryClient,
	missionId: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.missions.detail(missionId),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.dispatches.byTemplateAll(),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function useStartDispatch(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => startDispatchRequest(api, id),
		onSuccess: () => afterDispatchMoved(queryClient, missionId),
	});
}

export function useHaltDispatch(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => haltDispatchRequest(api, id),
		onSuccess: () => afterDispatchMoved(queryClient, missionId),
	});
}
