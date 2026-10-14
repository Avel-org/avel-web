import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CompletionReport,
	type CreateDispatchBody,
	contract,
	type Dispatch,
	MAX_PAGE_SIZE,
} from "avel-server/contract";
import { missionKeys } from "@/components/avel/mission-data";
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

/** Every dispatch on the mission, newest first. */
export function useMissionDispatches(missionId: string) {
	return useQuery(missionDispatchesQuery(useApiClient(), missionId));
}

export function dispatchQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.dispatches.detail(id),
		queryFn: () =>
			call(contract.dispatches.get, () =>
				api.dispatches.get({ params: { id } }),
			),
		refetchInterval: (query) =>
			pollWhile(query.state.data ? inMotion([query.state.data]) : false),
	});
}

/** One dispatch, polled while it waits or runs. */
export function useDispatch(id: string) {
	return useQuery(dispatchQuery(useApiClient(), id));
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
		queryClient.invalidateQueries({ queryKey: missionKeys.detail(missionId) }),
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
