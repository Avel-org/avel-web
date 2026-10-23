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
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Exports (modules 10 and 11, slice 1). A preview is an export with dryRun
 * true: it renders the mission's latest gate run and records what delivering
 * it would do, `blocked` included, instead of refusing. A real export renders
 * the run again and delivers it. Both finish inside their request, so a
 * preview answers `previewed` and a zip answers `done`: nothing here polls.
 * A refusal writes no export.
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

/** Reads nothing until there is an id to read. */
export function useExport(id: string | null) {
	return useQuery({
		...exportQuery(useApiClient(), id ?? ""),
		enabled: id !== null,
	});
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
	});
}
