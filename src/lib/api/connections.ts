import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type Connection,
	type connectionScopeType,
	type connectionService,
	type connectionStatus,
	contract,
	type createConnectionBody,
} from "avel-server/contract";
import type { z } from "zod";
import type { StatusTone } from "@/components/avel/status-pill";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Connections (module 2): the accounts AVEL delivers through. The list, one
 * connection by id, and create. A connection holds the name of the server
 * environment variable its token is in, never the token.
 */

export const CONNECTIONS_PAGE_SIZE = 50;

/** One page of contract.connections.list: its meta always carries the exact total. */
export type ConnectionsPage = Awaited<ReturnType<typeof fetchConnectionsPage>>;

function fetchConnectionsPage(api: ApiClient, cursor: string | undefined) {
	return callPage(contract.connections.list, () =>
		api.connections.list({
			query: {
				limit: CONNECTIONS_PAGE_SIZE,
				...(cursor ? { cursor } : {}),
			},
		}),
	);
}

/** contract.connections.list, newest first, a page at a time. */
export function connectionsQuery(api: ApiClient) {
	return infiniteQueryOptions({
		queryKey: queryKeys.connections.list(CONNECTIONS_PAGE_SIZE),
		queryFn: ({ pageParam }) => fetchConnectionsPage(api, pageParam),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useConnections() {
	return useInfiniteQuery(connectionsQuery(useApiClient()));
}

/**
 * How many live connections an engagement has: the ones closing it revokes.
 * One row is read for the route's exact meta.total.
 */
export function engagementConnectionCountQuery(
	api: ApiClient,
	engagementId: string,
) {
	return queryOptions({
		queryKey: queryKeys.connections.activeCount(engagementId),
		queryFn: () =>
			callPage(contract.connections.list, () =>
				api.connections.list({
					query: { engagementId, status: "active", limit: 1 },
				}),
			),
		select: (page) => page.meta.total,
	});
}

/** The live connection count for an engagement; idle until one is chosen. */
export function useEngagementConnectionCount(engagementId: string | null) {
	return useQuery({
		...engagementConnectionCountQuery(useApiClient(), engagementId ?? ""),
		enabled: engagementId !== null,
	});
}

/**
 * A connection a list already holds, and when that list was read, so its
 * details open with no wait. Every cached connections list is searched,
 * filtered or not; the counts hold no rows and are passed over.
 */
export function cachedConnection(
	queryClient: QueryClient,
	id: string,
): { connection: Connection; readAt: number } | undefined {
	for (const query of queryClient
		.getQueryCache()
		.findAll({ queryKey: queryKeys.connections.all() })) {
		const data = query.state.data as InfiniteData<ConnectionsPage> | undefined;
		if (!data || typeof data !== "object" || !("pages" in data)) continue;
		const connection = loadedConnections(data).find((c) => c.id === id);
		if (connection) return { connection, readAt: query.state.dataUpdatedAt };
	}
	return undefined;
}

export function connectionQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.connections.detail(id),
		queryFn: () =>
			call(contract.connections.get, () =>
				api.connections.get({ params: { id } }),
			),
	});
}

/**
 * contract.connections.get: one connection, for its details. Seeded from a
 * list that holds it, as old as that list's read, so the details show at
 * once and then read on their own; a deep link works with no list loaded.
 */
export function useConnection(id: string) {
	const queryClient = useQueryClient();
	return useQuery({
		...connectionQuery(useApiClient(), id),
		initialData: () => cachedConnection(queryClient, id)?.connection,
		initialDataUpdatedAt: () => cachedConnection(queryClient, id)?.readAt,
	});
}

export type CreateConnectionBody = z.input<typeof createConnectionBody>;

/**
 * A new connection shows in every list and count, and logs an activity row:
 * every connections read and the log read again.
 */
export function afterConnectionCreated(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** POST /api/connections: an active GitHub connection. */
export function createConnectionRequest(
	api: ApiClient,
	body: CreateConnectionBody,
) {
	return call(contract.connections.create, () =>
		api.connections.create({ body }),
	);
}

export function useCreateConnection() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: CreateConnectionBody) =>
			createConnectionRequest(api, body),
		onSuccess: () => afterConnectionCreated(queryClient),
	});
}

/** Every connection loaded so far, across the pages fetched. */
export function loadedConnections(
	data: InfiniteData<ConnectionsPage>,
): Connection[] {
	return data.pages.flatMap((page) => page.data);
}

/** The exact total from the first page: the route always counts. */
export function connectionsTotal(
	data: InfiniteData<ConnectionsPage> | undefined,
): number | undefined {
	return data?.pages[0]?.meta.total;
}

/** "1 connection", "5 connections". */
export function connectionCountLabel(total: number): string {
	return total === 1 ? "1 connection" : `${total} connections`;
}

/*
 * The contract exports these three as zod enums without named types, so
 * they are inferred here, never redeclared.
 */
export type ConnectionStatus = z.infer<typeof connectionStatus>;
export type ConnectionService = z.infer<typeof connectionService>;
export type ConnectionScopeType = z.infer<typeof connectionScopeType>;

/** Each status's tone and word. Keyed on the contract's union, so a new status fails the build. */
export const CONNECTION_STATUS = {
	active: { tone: "pass", label: "Active" },
	expired: { tone: "warn", label: "Expired" },
	revoked: { tone: "stale", label: "Revoked" },
} as const satisfies Record<
	ConnectionStatus,
	{ tone: StatusTone; label: string }
>;

/** The service as a word. Keyed on the contract's union. */
export const CONNECTION_SERVICE = {
	github: "GitHub",
} as const satisfies Record<ConnectionService, string>;

/** The scope type as a word. Keyed on the contract's union. */
export const CONNECTION_SCOPE = {
	owner: "Owner",
	repo: "Repository",
} as const satisfies Record<ConnectionScopeType, string>;
