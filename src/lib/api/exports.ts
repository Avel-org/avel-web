import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { contract, type ExportWire } from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage, defaultBaseUrl } from "./client";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Exports (modules 10 and 11). A preview is an export with dryRun true: it
 * renders the mission's latest gate run and records what delivering it would
 * do, `blocked` included, instead of refusing. A real export renders the run
 * again and delivers it. Both finish inside their request: a preview answers
 * `previewed`, a zip `done`, a GitHub pull request `pr-open`. Only a resend
 * that lands while its first request still writes answers `delivering`, and
 * that export is read again until it settles. A refusal writes no export. A
 * GitHub 502 names the one it wrote (details.exportId): `failed` when GitHub
 * refused partway, still `delivering` when GitHub went quiet, which its page
 * reads until it settles and asks GitHub about once.
 *
 * A pull request moves on GitHub, not here: refresh reads it, once when its
 * page opens and when asked, never on a timer (it spends the connection's
 * GitHub calls).
 */

export type PreviewExportBody = z.input<typeof contract.exports.preview.body>;
export type CreateExportBody = z.input<typeof contract.exports.create.body>;
export type ExportTarget = PreviewExportBody["target"];

/** How many exports a page of a mission's list reads. */
export const EXPORTS_PAGE = 20;

// ---------------------------------------------------------------------------
// Reads.

/** contract.exports.list: the mission's exports, previews included, newest first. */
export function missionExportsQuery(api: ApiClient, missionId: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.exports.list(missionId),
		queryFn: ({ pageParam }) =>
			callPage(contract.exports.list, () =>
				api.exports.list({
					params: { id: missionId },
					query: {
						limit: EXPORTS_PAGE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useMissionExports(missionId: string) {
	return useInfiniteQuery(missionExportsQuery(useApiClient(), missionId));
}

/** contract.exports.get: one export, by id. */
export function exportQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.exports.detail(id),
		queryFn: () =>
			call(contract.exports.get, () => api.exports.get({ params: { id } })),
	});
}

/** How often an export still delivering is read again. */
export const EXPORT_POLL_MS = 3_000;

/**
 * How often an open pull request's export is read: GitHub's webhook moves
 * it to done or closed on the server (2026-10-24), and this picks that up
 * without a refresh. Slower than delivering, which settles in seconds.
 */
export const PR_OPEN_POLL_MS = 15_000;

/** How often an export is read again for its status, or false when settled. */
export function exportPollMs(exp: Pick<ExportWire, "status"> | undefined) {
	if (exp?.status === "delivering") return EXPORT_POLL_MS;
	if (exp?.status === "pr-open") return PR_OPEN_POLL_MS;
	return false;
}

/**
 * Reads nothing until there is an id to read. While it is delivering (a
 * resend answered before the first request finished) it reads again.
 */
export function useExport(id: string | null) {
	return useQuery({
		...exportQuery(useApiClient(), id ?? ""),
		enabled: id !== null,
		refetchInterval: (query) => exportPollMs(query.state.data),
	});
}

/** A pull request's export the page can ask GitHub about. */
export function refreshable(exp: ExportWire): boolean {
	return (
		exp.targetKind === "github_pr" &&
		!exp.dryRun &&
		(exp.status === "pr-open" || exp.status === "delivering")
	);
}

/**
 * The export a GitHub 502 left behind (details.exportId), if named: failed
 * when GitHub refused partway, or still delivering when GitHub went quiet
 * and the server couldn't tell whether the pull request was opened.
 */
export function writtenExportId(error: ApiError | null): string | null {
	const failure = error?.failure;
	if (
		failure?.kind !== "contract" ||
		(failure.code !== "GITHUB_REJECTED" && failure.code !== "EXTERNAL_GITHUB")
	)
		return null;
	const { details } = failure as { details?: unknown };
	const id =
		details && typeof details === "object" && "exportId" in details
			? details.exportId
			: undefined;
	return typeof id === "string" ? id : null;
}

/**
 * Where a done zip's bytes download from: a byte route outside the contract,
 * always an attachment. It re-renders the package and checks it against the
 * stored sha256, so it never expires.
 */
export function exportZipUrl(id: string): string {
	return `${defaultBaseUrl()}/api/exports/${id}/zip`;
}

// ---------------------------------------------------------------------------
// Writes.

/**
 * One attempt: its body and the key that makes a resend a replay. The same
 * body again keeps the key, so a request that landed before the connection
 * dropped answers with the stored export instead of rendering twice.
 */
export type ExportAttempt<B> = { key: string; body: B };

export function exportAttemptFor<B>(
	last: ExportAttempt<B> | null,
	body: B,
	freshKey: () => string = () => crypto.randomUUID(),
): ExportAttempt<B> {
	return last && JSON.stringify(last.body) === JSON.stringify(body)
		? last
		: { key: freshKey(), body };
}

/**
 * A new export is the mission's newest: its list, every mission read's
 * lastExport and the log change. The export itself is stored as answered.
 */
export function afterExport(queryClient: QueryClient, written?: ExportWire) {
	if (written)
		queryClient.setQueryData(queryKeys.exports.detail(written.id), written);
	return Promise.all([
		// The list sits under the mission's detail key; every mission read
		// carries lastExport.
		queryClient.invalidateQueries({ queryKey: queryKeys.missions.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function usePreviewExport() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ key, body }: ExportAttempt<PreviewExportBody>) =>
			call(contract.exports.preview, () =>
				api.exports.preview({ headers: { "idempotency-key": key }, body }),
			),
		onSuccess: (written) => afterExport(queryClient, written),
	});
}

export function useCreateExport() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ key, body }: ExportAttempt<CreateExportBody>) =>
			call(contract.exports.create, () =>
				api.exports.create({ headers: { "idempotency-key": key }, body }),
			),
		onSuccess: (written) => afterExport(queryClient, written),
		// A GitHub 502 still wrote an export, failed or delivering: the lists
		// read again so it shows.
		onError: (error) => {
			if (writtenExportId(error) !== null) return afterExport(queryClient);
		},
	});
}

/**
 * POST refresh: reads the pull request on GitHub. Merged moves the export to
 * done, closed to closed; a delivering one whose PR exists to pr-open.
 */
export function refreshExportRequest(api: ApiClient, id: string) {
	return call(contract.exports.refresh, () =>
		api.exports.refresh({ params: { id } }),
	);
}

export function useRefreshExport() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => refreshExportRequest(api, id),
		onSuccess: (written) => afterExport(queryClient, written),
	});
}
