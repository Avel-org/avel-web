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
	type GateJob,
	type PermanentCheck,
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
 * Since 2026-10-23 a run happens in the background: Run gate queues a job
 * (202), the server's tick runs it, and the job, polled, names the run it
 * made when done. One job runs at a time, server-wide.
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

/** How often a queued or running job is read: the server's tick is 2 s. */
export const GATE_JOB_POLL_MS = 2_000;

/** True while a job can still change on its own. */
export const jobInMotion = (job: Pick<GateJob, "status"> | undefined) =>
	job?.status === "queued" || job?.status === "running";

/**
 * contract.gate.job: one background run, read every GATE_JOB_POLL_MS while
 * it is in motion, and never again once it is done or failed.
 */
export function gateJobQuery(api: ApiClient, jobId: string) {
	return queryOptions({
		queryKey: queryKeys.gate.job(jobId),
		queryFn: () =>
			call(contract.gate.job, () => api.gate.job({ params: { id: jobId } })),
		refetchInterval: (query) =>
			jobInMotion(query.state.data) ? GATE_JOB_POLL_MS : false,
	});
}

/**
 * The job, seeded from what the page already holds (the POST's answer, or
 * the mission's activeGateJob after a reload) so it shows at once.
 */
export function useGateJob(jobId: string | null, seed?: GateJob | null) {
	return useQuery({
		...gateJobQuery(useApiClient(), jobId ?? ""),
		enabled: jobId !== null,
		initialData: seed && seed.id === jobId ? seed : undefined,
	});
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
 * A list of missions (list, newest, by template), whose rows say
 * gateRunning. A mission's detail and what sits under it are not lists.
 */
export function missionLists(queryKey: readonly unknown[]): boolean {
	return (
		queryKey[0] === "missions" &&
		(queryKey[1] === "list" ||
			queryKey[1] === "newest" ||
			queryKey[1] === "byTemplate")
	);
}

/**
 * The mission's own row (its activeGateJob and gateRunning) and every list
 * of missions: what a gate job's start or end changes on a mission. Only
 * the row, exactly: its dispatches, reports and exports sit under its key
 * and a job changes none of them.
 */
function missionRowAndLists(queryClient: QueryClient, missionId: string) {
	return [
		queryClient.invalidateQueries({
			queryKey: queryKeys.missions.detail(missionId),
			exact: true,
		}),
		queryClient.invalidateQueries({
			predicate: ({ queryKey }) => missionLists(queryKey),
		}),
	];
}

/**
 * Queuing writes a job and a log row: the job's own read takes the answer,
 * and the mission reads again for its activeGateJob and gateRunning.
 */
export function afterGateQueued(queryClient: QueryClient, job: GateJob) {
	queryClient.setQueryData(queryKeys.gate.job(job.id), job);
	return Promise.all([
		...missionRowAndLists(queryClient, job.missionId),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/**
 * A job that ended added a run (done) or nothing (failed), and a log row
 * either way: the mission's row, its runs, findings, the lists and the log
 * read again. A run's own receipt never changes, so it is left alone. A
 * triage moves a finding between lists. Each refreshes only what it changed.
 */
export function afterGateRun(queryClient: QueryClient, missionId: string) {
	return Promise.all([
		...missionRowAndLists(queryClient, missionId),
		// An agent's measures count missions gated and first-pass verified.
		queryClient.invalidateQueries({
			queryKey: queryKeys.dispatches.byTemplateAll(),
		}),
		// The runs list itself, not the receipts keyed under it.
		queryClient.invalidateQueries({
			queryKey: queryKeys.gate.runs(missionId),
			exact: true,
		}),
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

/**
 * The queued job, and whether it was already the mission's: a 200 with
 * Gate-Job-Existing answers with the job another tab or operator queued,
 * whose overrides stand, so the ones this attempt carried were not sent.
 * An idempotent replay is also a 200 but names this attempt's own job.
 */
export type GateQueued = { job: GateJob; existing: boolean };

export const GATE_JOB_EXISTING_HEADER = "gate-job-existing";

export async function runGateRequest(
	api: ApiClient,
	missionId: string,
	{ key, overrides }: GateAttempt,
): Promise<GateQueued> {
	let existing = false;
	const job = await call(contract.gate.run, async () => {
		const response = await api.gate.run({
			params: { id: missionId },
			headers: { "idempotency-key": key },
			body: { overrides },
		});
		existing = response.headers.get(GATE_JOB_EXISTING_HEADER) === "true";
		return response;
	});
	return { job, existing };
}

export function useRunGate(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (attempt: GateAttempt) =>
			runGateRequest(api, missionId, attempt),
		onSuccess: ({ job }) => afterGateQueued(queryClient, job),
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

/**
 * PUT /api/findings/:id/check (module 12): attach, replace or remove a
 * confirmed finding's permanent check. It changes the finding and logs a
 * row, as a triage does; later missions read it at their next gate run.
 */
export function useSetFindingCheck(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, check }: { id: string; check: PermanentCheck | null }) =>
			call(contract.findings.setCheck, () =>
				api.findings.setCheck({ params: { id }, body: { check } }),
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
