import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	contract,
	type FindingStatus,
	type GateRun,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The gate (module 9) and its findings. A gate run judges a mission's
 * integration commit and returns a receipt; avel-server keeps runs in the
 * activity log and serves them through typed routes, newest first, so the
 * first row is the latest verdict. Findings are triaged by the operator once:
 * confirmed or dismissed.
 *
 * Overrides are bound to a commit and sent with each run: a re-run re-sends
 * them, and they drop when the judged commit changes.
 */

type RunGateBody = z.input<typeof contract.gate.run.body>;
export type GateOverride = NonNullable<RunGateBody["overrides"]>[number];

/** How many runs and findings a page reads. */
export const GATE_RUNS_PAGE = 20;
export const FINDINGS_PAGE = 50;

// ---------------------------------------------------------------------------
// Reads.

/** contract.gate.runs: summaries, newest first; the first is the verdict now. */
export function gateRunsQuery(api: ApiClient, missionId: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.gate.runs(missionId),
		queryFn: ({ pageParam }) =>
			callPage(contract.gate.runs, () =>
				api.gate.runs({
					params: { id: missionId },
					query: {
						limit: GATE_RUNS_PAGE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useGateRuns(missionId: string) {
	return useInfiniteQuery(gateRunsQuery(useApiClient(), missionId));
}

/** contract.gate.getRun: one run's full receipt. A run never changes. */
export function gateRunQuery(api: ApiClient, missionId: string, runId: string) {
	return queryOptions({
		queryKey: queryKeys.gate.run(missionId, runId),
		queryFn: () =>
			call(contract.gate.getRun, () =>
				api.gate.getRun({ params: { id: missionId, runId } }),
			),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useGateRun(missionId: string, runId: string | null) {
	return useQuery({
		...gateRunQuery(useApiClient(), missionId, runId ?? ""),
		enabled: runId !== null,
	});
}

/** contract.findings.list: one status or all, with counts over the mission. */
export function findingsQuery(
	api: ApiClient,
	missionId: string,
	status?: FindingStatus,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.findings.list(missionId, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.findings.list, () =>
				api.findings.list({
					params: { id: missionId },
					query: {
						limit: FINDINGS_PAGE,
						...(status ? { status } : {}),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useFindings(missionId: string, status?: FindingStatus) {
	return useInfiniteQuery(findingsQuery(useApiClient(), missionId, status));
}

// ---------------------------------------------------------------------------
// Writes.

/**
 * One run attempt: its body and the key that makes a resend a replay. The
 * same overrides again keep the key, so a run that landed before the
 * connection dropped answers with the stored run instead of judging twice.
 */
export type GateAttempt = { key: string; overrides: GateOverride[] };

const sameOverrides = (a: GateOverride[], b: GateOverride[]) =>
	JSON.stringify(a) === JSON.stringify(b);

export function gateAttemptFor(
	last: GateAttempt | null,
	overrides: GateOverride[],
	freshKey: () => string = () => crypto.randomUUID(),
): GateAttempt {
	return last && sameOverrides(last.overrides, overrides)
		? last
		: { key: freshKey(), overrides };
}

/**
 * A run adds a row to the runs list and the log; a triage moves a finding
 * between lists. Each refreshes only what it changed.
 */
export function afterGateRun(queryClient: QueryClient, missionId: string) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.gate.runs(missionId) }),
		queryClient.invalidateQueries({
			queryKey: queryKeys.findings.all(missionId),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function afterTriage(queryClient: QueryClient, missionId: string) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.findings.all(missionId),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function runGateRequest(
	api: ApiClient,
	missionId: string,
	{ key, overrides }: GateAttempt,
): Promise<GateRun> {
	return call(contract.gate.run, () =>
		api.gate.run({
			params: { id: missionId },
			headers: { "idempotency-key": key },
			body: { overrides },
		}),
	);
}

export function useRunGate(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (attempt: GateAttempt) =>
			runGateRequest(api, missionId, attempt),
		onSuccess: (run) => {
			queryClient.setQueryData(queryKeys.gate.run(missionId, run.id), run);
			return afterGateRun(queryClient, missionId);
		},
	});
}

export function useConfirmFinding(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			call(contract.findings.confirm, () =>
				api.findings.confirm({ params: { id } }),
			),
		onSuccess: () => afterTriage(queryClient, missionId),
	});
}

export function useDismissFinding(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) =>
			call(contract.findings.dismiss, () =>
				api.findings.dismiss({ params: { id }, body: { reason } }),
			),
		onSuccess: () => afterTriage(queryClient, missionId),
	});
}
