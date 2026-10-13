import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ApiFetcher } from "@ts-rest/core";
import type {
	ActivityEntry,
	Client,
	Engagement,
	PreconditionDetails,
	ValidationDetails,
} from "avel-server/contract";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
	ApiError,
	type ApiFailure,
	ApiOverrideProvider,
	createApiClient,
} from "../src/lib/api";
import { AGENT_ACTIVITY_LIMIT } from "../src/lib/api/activity";
import {
	CLIENTS_PAGE_SIZE,
	ENGAGEMENTS_PAGE_SIZE,
	type Page,
} from "../src/lib/api/clients";
import { queryKeys } from "../src/lib/api/keys";
import { SessionSourceProvider } from "../src/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";

/**
 * Shared fixtures for the Clients tests. Not a test file: vitest collects
 * only *.test.ts(x). Shapes are the contract's own types, so a contract
 * change that these fixtures no longer satisfy fails the typecheck.
 */

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function client(n: number, overrides: Partial<Client> = {}): Client {
	return {
		id: ID(n),
		name: `Client ${n}`,
		status: "active",
		primaryContact: `contact${n}@example.com`,
		notesMd: null,
		engagementCount: 3,
		activeEngagementCount: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-05T09:00:00.000Z",
		...overrides,
	};
}

export function engagement(
	n: number,
	clientId: string,
	overrides: Partial<Engagement> = {},
): Engagement {
	return {
		id: ID(1000 + n),
		clientId,
		name: `Engagement ${n}`,
		scopeMd: null,
		status: "active",
		startedAt: "2026-09-01T00:00:00.000Z",
		closedAt: null,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		...overrides,
	};
}

/**
 * An error envelope's failure, as the data layer would throw it. Typed per
 * code, like the contract: a precondition carries its reason, a validation
 * failure its issues, so a test cannot build an error the server cannot send.
 */
export function contractError(
	status: number,
	code: "PRECONDITION_FAILED",
	details: PreconditionDetails,
): ApiError;
export function contractError(
	status: number,
	code: "VALIDATION_FAILED",
	details?: ValidationDetails,
): ApiError;
export function contractError(
	status: number,
	code: "CONFLICT" | "NOT_FOUND",
): ApiError;
export function contractError(
	status: number,
	code: "VALIDATION_FAILED" | "PRECONDITION_FAILED" | "CONFLICT" | "NOT_FOUND",
	details?: PreconditionDetails | ValidationDetails,
): ApiError {
	// The overloads above pair each code with its details; this body only
	// assembles them, so the one cast is safe.
	return new ApiError({
		method: "POST",
		path: "/api/x",
		kind: "contract",
		status,
		code,
		message: "server message, never shown",
		details,
		requestId: "req_test",
	} as ApiFailure);
}

export type Recorded = { method: string; path: string; body: unknown };

/**
 * An API client whose fetcher answers from `respond` and records each call.
 * The default answer fails the test: a render that is not meant to fetch
 * proves it did not.
 */
export function fakeApi(
	respond: (call: Recorded) => { status: number; body: unknown } = (call) => {
		throw new Error(`unexpected request: ${call.method} ${call.path}`);
	},
) {
	const calls: Recorded[] = [];
	const api: ApiFetcher = async (args) => {
		const call = {
			method: args.method,
			path: args.path,
			body: args.body ? JSON.parse(String(args.body)) : undefined,
		};
		calls.push(call);
		const { status, body } = respond(call);
		return { status, body, headers: new Headers() };
	};
	return {
		client: createApiClient({ baseUrl: "http://avel.test", api }),
		calls,
	};
}

/** What a rendered Clients route finds already in its cache. */
export type ClientsSeed = {
	/** The first page of the clients list, under this search. */
	list?: { page: Page<Client>; q?: string };
	/** One client by id, or the error its fetch failed with. */
	detail?: { id: string; value: Client | ApiError };
	/** A client's engagements, all or one status. */
	engagements?: {
		clientId: string;
		rows: Engagement[];
		status?: Engagement["status"];
	}[];
	/** One entity's latest log entries. */
	activity?: {
		entityType: "client" | "engagement";
		entityId: string;
		rows: ActivityEntry[];
	}[];
};

/**
 * A Clients route rendered through the real router and root layout, with
 * its cache seeded: the server render the browser would hydrate. Nothing is
 * fetched; a query left unseeded renders its loading state.
 */
export async function renderClientsRoute(
	path: string,
	seed: ClientsSeed = {},
): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				// A seeded error stays an error instead of refetching on mount.
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	const paged = <T>(rows: T[]) => ({
		pages: [{ data: rows, meta: { nextCursor: null } }],
		pageParams: [undefined],
	});
	if (seed.list) {
		queryClient.setQueryData(
			queryKeys.clients.list(CLIENTS_PAGE_SIZE, seed.list.q),
			{ pages: [seed.list.page], pageParams: [undefined] },
		);
	}
	if (seed.detail) {
		const { id, value } = seed.detail;
		if (value instanceof ApiError) {
			queryClient
				.getQueryCache()
				.build(queryClient, { queryKey: queryKeys.clients.detail(id) })
				.setState({ status: "error", fetchStatus: "idle", error: value });
		} else {
			queryClient.setQueryData(queryKeys.clients.detail(id), value);
		}
	}
	for (const e of seed.engagements ?? []) {
		queryClient.setQueryData(
			queryKeys.engagements.byClient(
				e.clientId,
				ENGAGEMENTS_PAGE_SIZE,
				e.status,
			),
			paged(e.rows),
		);
	}
	for (const a of seed.activity ?? []) {
		queryClient.setQueryData(
			queryKeys.activity.entity(a.entityType, a.entityId, AGENT_ACTIVITY_LIMIT),
			{ data: a.rows, meta: { nextCursor: null, total: a.rows.length } },
		);
	}
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		createElement(
			SessionSourceProvider,
			{ source: signedIn() },
			createElement(
				ApiOverrideProvider,
				{ queryClient },
				createElement(RouterProvider, { router }),
			),
		),
	);
}

/** One activity log row about a client or an engagement. */
export function activityEntry(
	n: number,
	entityType: "client" | "engagement",
	entityId: string,
	overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
	return {
		id: ID(5000 + n),
		at: `2026-10-0${n}T10:00:00.000Z`,
		actorKind: "operator",
		actorUserId: ID(1),
		actorRosterEntryId: null,
		action: entityType === "client" ? "client.updated" : "engagement.created",
		entityType,
		entityId,
		missionId: null,
		engagementId: entityType === "engagement" ? entityId : null,
		requestId: `req_${n}`,
		payload: {},
		actor: { kind: "operator", display: "ada" },
		...overrides,
	};
}
