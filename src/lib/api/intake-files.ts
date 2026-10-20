import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { contract, type IntakeFile } from "avel-server/contract";
import { type ApiClient, callPage, defaultBaseUrl } from "./client";
import type { ContractErrorCode } from "./errors";
import { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * An intake's uploaded documents: Canon reads them. These are byte routes,
 * outside the ts-rest contract (avel-server src/routes/files.ts), so they go
 * through plain fetch here, but they fail the same way every contract call
 * does: an ApiError with the envelope's code and request id, or
 * "unreachable" when nothing (or a gateway with no envelope) answered.
 *
 * Accepted: UTF-8 text (Markdown, plain text, HTML), at most 10 MB; the
 * server detects the type and ignores Content-Type. A download is always an
 * attachment and HTML comes back as octet-stream: never render one inline.
 */

/** The largest upload avel-server accepts (DEFAULT_UPLOAD_MAX_BYTES). */
export const INTAKE_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** What an upload answers with: the contract's intakeFile. */
export type UploadedIntakeFile = IntakeFile;

/** How many files a page reads. An intake holds a handful of documents. */
export const INTAKE_FILES_PAGE = 50;

/**
 * contract.intakeFiles.list: the intake's uploads, oldest first, so the list
 * reads in upload order. Purged tombstones only when asked for.
 */
export function intakeFilesQuery(
	api: ApiClient,
	intakeId: string,
	includePurged = false,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.intakes.files(intakeId, includePurged),
		queryFn: ({ pageParam }) =>
			callPage(contract.intakeFiles.list, () =>
				api.intakeFiles.list({
					params: { id: intakeId },
					query: {
						limit: INTAKE_FILES_PAGE,
						includePurged: includePurged ? "true" : "false",
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useIntakeFiles(intakeId: string, includePurged = false) {
	return useInfiniteQuery(
		intakeFilesQuery(useApiClient(), intakeId, includePurged),
	);
}

/** Every file loaded so far, across the pages read. */
export function loadedIntakeFiles(
	data: InfiniteData<{ data: IntakeFile[] }>,
): IntakeFile[] {
	return data.pages.flatMap((page) => page.data);
}

/**
 * An upload or a purge changes the intake's file list and logs an activity
 * row (file.uploaded, file.purged), so both read again.
 */
export function afterIntakeFileWrite(
	queryClient: QueryClient,
	intakeId: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.intakes.detail(intakeId),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function useUploadIntakeFile(intakeId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ file, name }: { file: Blob; name: string }) =>
			uploadIntakeFile(intakeId, file, name),
		onSuccess: () => afterIntakeFileWrite(queryClient, intakeId),
	});
}

export function usePurgeIntakeFile(intakeId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (fileId: string) => purgeIntakeFile(intakeId, fileId),
		onSuccess: () => afterIntakeFileWrite(queryClient, intakeId),
	});
}

const path = (intakeId: string) => `/api/intakes/${intakeId}/files`;

/** Where a file's bytes download from: an attachment, never shown inline. */
export function intakeFileContentUrl(intakeId: string, fileId: string): string {
	return `${defaultBaseUrl()}${path(intakeId)}/${fileId}/content`;
}

async function send(
	method: "POST" | "DELETE",
	url: string,
	routePath: string,
	body?: Blob,
): Promise<unknown> {
	const where = { method, path: routePath };
	let response: Response;
	try {
		response = await fetch(url, {
			method,
			body,
			// Same-origin, so the session cookie goes and the proxy adds Origin.
			credentials: "same-origin",
		});
	} catch (cause) {
		throw new ApiError({ ...where, kind: "unreachable" }, { cause });
	}
	const json = (await response.json().catch(() => null)) as {
		data?: unknown;
		error?: {
			code: ContractErrorCode;
			message: string;
			requestId?: string;
			details?: unknown;
		};
	} | null;
	if (response.ok) return json?.data;
	if (json?.error) {
		throw new ApiError({
			...where,
			kind: "contract",
			status: response.status,
			...json.error,
		} as ConstructorParameters<typeof ApiError>[0]);
	}
	// A gateway's 502, 503 or 504 with no envelope: avel-server isn't there.
	throw new ApiError(
		[502, 503, 504].includes(response.status)
			? { ...where, kind: "unreachable" }
			: { ...where, kind: "unexpected-status", status: response.status },
	);
}

/** Uploads one text document to the intake. The file's name goes in ?name=. */
export async function uploadIntakeFile(
	intakeId: string,
	file: Blob,
	name: string,
): Promise<UploadedIntakeFile> {
	const url = `${defaultBaseUrl()}${path(intakeId)}?name=${encodeURIComponent(name)}`;
	return (await send(
		"POST",
		url,
		"/api/intakes/:intakeId/files",
		file,
	)) as UploadedIntakeFile;
}

/** Purges a file: its bytes go, a tombstone stays. Repeating it is harmless. */
export async function purgeIntakeFile(
	intakeId: string,
	fileId: string,
): Promise<void> {
	await send(
		"DELETE",
		`${defaultBaseUrl()}${path(intakeId)}/${fileId}`,
		"/api/intakes/:intakeId/files/:fileId",
	);
}

/**
 * Why a file can't be uploaded, checked before sending it; null when it can.
 * Only the size: the server detects the type from the bytes, and its refusal
 * (400 VALIDATION_FAILED) is the one answer about type.
 */
export function uploadProblem(file: { size: number }): string | null {
	return file.size > INTAKE_FILE_MAX_BYTES
		? "This file is over 10 MB, the most an intake takes."
		: null;
}
