import {
	type InfiniteData,
	infiniteQueryOptions,
	queryOptions,
	type UseInfiniteQueryResult,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import {
	contract,
	type ExportStatus,
	type MissionListItem,
	type MissionStatus,
	type needsYouReason,
} from "avel-server/contract";
import type { z } from "zod";
import {
	type ApiClient,
	type ApiError,
	call,
	callPage,
	queryKeys,
	useApiClient,
} from "@/lib/api";
import type { Direction, Origin, Sort } from "./mission-search";
import type { SurfaceQuery } from "./surface";

export const MISSIONS_PAGE_SIZE = 50;

/** What a list request asks for: the URL's filters in the contract's terms. */
export type MissionListParams = {
	origin: Origin;
	q: string;
	sort: Sort;
	includeArchived: boolean;
	/** Undefined for every status. */
	status?: readonly MissionStatus[];
	/** Only missions that need the operator (the server's filter). */
	needsYou?: boolean;
	/** Only missions with no activity before this instant, or none at all. */
	quietBefore?: string;
	/** Only missions whose newest export is in one of these statuses. */
	lastExportStatus?: readonly ExportStatus[];
	/** The sort's direction, when not its default. */
	direction?: Direction;
};

type NeedsYouReason = z.infer<typeof needsYouReason>;

/** Why a mission needs the operator, in words. Keyed on the contract's union. */
export const NEEDS_YOU_COPY = {
	export_previewed: "Preview ready to review",
	pr_open: "Pull request open",
} as const satisfies Record<NeedsYouReason, string>;

export function missionListQuery(api: ApiClient, params: MissionListParams) {
	return infiniteQueryOptions({
		queryKey: queryKeys.missions.list(params),
		initialPageParam: undefined as string | undefined,
		// The cursor is bound to its sort (a reused cursor under another sort is
		// a 400), so sort is part of the key and a new sort starts over.
		queryFn: ({ pageParam }) =>
			callPage(contract.missions.list, () =>
				api.missions.list({
					query: {
						origin: params.origin,
						q: params.q === "" ? undefined : params.q,
						sort: params.sort,
						includeArchived: params.includeArchived ? "true" : "false",
						// Omitted, not "false": "false" means no filter, and leaving
						// it out keeps the key and the request the same for both.
						needsYou: params.needsYou ? "true" : undefined,
						status: params.status ? [...params.status] : undefined,
						quietBefore: params.quietBefore,
						lastExportStatus: params.lastExportStatus
							? [...params.lastExportStatus]
							: undefined,
						// Part of the key with the sort: a cursor is bound to both.
						direction: params.direction,
						limit: MISSIONS_PAGE_SIZE,
						cursor: pageParam,
					},
				}),
			),
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

/** What the newest read narrows by: the list's filters, not its sort. */
export type NewestParams = Omit<MissionListParams, "sort" | "direction">;

/**
 * The newest mission under a filter set: one row, sorted by last activity,
 * newest first, whatever the page's own sort. A status card needs only
 * that row, so it never reads a full page to find it.
 */
export function newestMissionQuery(api: ApiClient, params: NewestParams) {
	return queryOptions({
		queryKey: queryKeys.missions.newest(params),
		queryFn: () =>
			call(contract.missions.list, () =>
				api.missions.list({
					query: {
						origin: params.origin,
						q: params.q === "" ? undefined : params.q,
						sort: "lastActivity",
						direction: "desc",
						includeArchived: params.includeArchived ? "true" : "false",
						needsYou: params.needsYou ? "true" : undefined,
						status: params.status ? [...params.status] : undefined,
						quietBefore: params.quietBefore,
						lastExportStatus: params.lastExportStatus
							? [...params.lastExportStatus]
							: undefined,
						limit: 1,
					},
				}),
			),
		select: (rows) => rows[0] ?? null,
	});
}

export function missionDetailQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.missions.detail(id),
		queryFn: () =>
			call(contract.missions.get, () => api.missions.get({ params: { id } })),
	});
}

export function useMissionList(params: MissionListParams) {
	return useInfiniteQuery(missionListQuery(useApiClient(), params));
}

export function useMission(id: string) {
	return useQuery(missionDetailQuery(useApiClient(), id));
}

type ListPage = Awaited<
	ReturnType<NonNullable<ReturnType<typeof missionListQuery>["queryFn"]>>
>;
export type MissionList = UseInfiniteQueryResult<
	InfiniteData<ListPage>,
	ApiError
>;

/** Every row loaded so far, across pages. */
export function rowsOf(list: MissionList): MissionListItem[] {
	return list.data?.pages.flatMap((page) => page.data) ?? [];
}

/** The counts of the newest page; undefined until one has loaded. */
export function countsOf(list: MissionList) {
	return list.data?.pages.at(-1)?.meta.counts;
}

/**
 * How many missions the list's own filters keep, exact and the same on every
 * page (meta.total); undefined until a page has loaded.
 */
export function totalOf(list: MissionList): number | undefined {
	return list.data?.pages.at(-1)?.meta.total;
}

/** An infinite list as <Surface> reads it: every row loaded so far. */
export function asSurface(
	list: MissionList,
): SurfaceQuery<MissionListItem[], ApiError> {
	if (list.status === "error") {
		return {
			status: "error",
			error: list.error,
			refetch: list.refetch,
			isFetching: list.isFetching,
		};
	}
	if (list.status === "pending") return { status: "pending" };
	return {
		status: "success",
		data: rowsOf(list),
		dataUpdatedAt: list.dataUpdatedAt,
		refetch: list.refetch,
		isFetching: list.isFetching,
	};
}
