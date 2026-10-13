import type { QueryFunctionContext } from "@tanstack/react-query";
import { clientSchema } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	AGENT_ACTIVITY_LIMIT,
	CLIENT_ACTIVITY_PAGE_SIZE,
	clientActivityQuery,
	entitiesActivityQuery,
	MAX_ENTITY_IDS,
} from "../src/lib/api/activity";
import {
	CLIENT_MISSIONS_PAGE_SIZE,
	CLIENTS_PAGE_SIZE,
	clientCountLabel,
	clientFacts,
	clientMissionsQuery,
	clientsQuery,
	lastActivityLabel,
	missionCount,
} from "../src/lib/api/clients";
import { queryKeys } from "../src/lib/api/keys";
import { client, fakeApi } from "./clients-fixtures";

/*
 * The read filters avel-server added in ed4c9e5, 028ac3c and 7cc7c75, as
 * the data layer sends them: clients by status, missions and activity by
 * client, and activity for several entities in one request.
 */

/** Runs an infinite query's queryFn for one page, as TanStack Query would. */
function runPage(
	options: { queryFn?: unknown; queryKey: readonly unknown[] },
	pageParam?: string,
) {
	const fn = options.queryFn as (ctx: QueryFunctionContext) => Promise<unknown>;
	return fn({
		queryKey: options.queryKey,
		pageParam,
		signal: new AbortController().signal,
		meta: undefined,
		client: undefined as never,
		direction: "forward",
	} as unknown as QueryFunctionContext);
}

const empty = (meta: Record<string, unknown> = {}) => ({
	status: 200,
	body: { success: true, data: [], meta: { nextCursor: null, ...meta } },
});

const counts = {
	byStatus: { draft: 0, active: 0, halted: 0, shipped: 0, archived: 0 },
	needsYou: 0,
};

describe("clients by status", () => {
	it("sends the status to the server and keys each status apart", async () => {
		const { client: api, calls } = fakeApi(() => empty({ total: 0 }));
		const closed = clientsQuery(api, undefined, "closed");
		await runPage(closed);
		expect(calls[0]?.path).toBe(
			`http://avel.test/api/clients?limit=${CLIENTS_PAGE_SIZE}&status=closed`,
		);
		expect(closed.queryKey).toEqual(
			queryKeys.clients.list(CLIENTS_PAGE_SIZE, undefined, "closed"),
		);
		expect(closed.queryKey).not.toEqual(clientsQuery(api).queryKey);
		expect(closed.queryKey).not.toEqual(
			clientsQuery(api, undefined, "active").queryKey,
		);
		// No status: the key is the one it always was.
		expect(JSON.stringify(clientsQuery(api).queryKey)).not.toContain(
			'"status"',
		);
	});
});

describe("the top bar's count under a status", () => {
	it("names the status, and a search still counts matches", () => {
		expect(clientCountLabel(2, false, "active")).toBe("2 active clients");
		expect(clientCountLabel(1, false, "closed")).toBe("1 closed client");
		expect(clientCountLabel(3, true, "closed")).toBe("3 clients match");
		expect(clientCountLabel(4, false)).toBe("4 clients");
	});
});

describe("a client's missions", () => {
	it("reads client missions narrowed by clientId, a page at a time", async () => {
		const c = client(1);
		const { client: api, calls } = fakeApi(() => empty({ total: 0, counts }));
		const list = clientMissionsQuery(api, c.id);
		await runPage(list);
		const url = new URL(calls[0]?.path ?? "");
		expect(url.pathname).toBe("/api/missions");
		expect(url.searchParams.get("origin")).toBe("client");
		expect(url.searchParams.get("clientId")).toBe(c.id);
		expect(url.searchParams.get("limit")).toBe(
			String(CLIENT_MISSIONS_PAGE_SIZE),
		);
		await runPage(list, "m2");
		expect(calls[1]?.path).toContain("cursor=m2");
	});

	it("reads a card's count with one row, under its own key", async () => {
		const c = client(1);
		const { client: api, calls } = fakeApi(() => empty({ total: 4, counts }));
		const count = clientMissionsQuery(api, c.id, 1);
		await runPage(count);
		expect(new URL(calls[0]?.path ?? "").searchParams.get("limit")).toBe("1");
		expect(count.queryKey).not.toEqual(clientMissionsQuery(api, c.id).queryKey);
		// Under "missions", so a mission write refreshes the counts.
		expect(count.queryKey[0]).toBe("missions");
	});

	it("counts missions in words", () => {
		expect(missionCount(1)).toBe("1 mission");
		expect(missionCount(0)).toBe("0 missions");
	});
});

describe("a client's activity", () => {
	it("is one paged read by clientId", async () => {
		const c = client(1);
		const { client: api, calls } = fakeApi(() => empty({ total: 0 }));
		const options = clientActivityQuery(api, c.id);
		await runPage(options);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.path).toBe(
			`http://avel.test/api/activity?limit=${CLIENT_ACTIVITY_PAGE_SIZE}&clientId=${c.id}`,
		);
		await runPage(options, "a2");
		expect(calls[1]?.path).toContain("cursor=a2");
		expect(options.queryKey).toEqual(
			queryKeys.activity.client(c.id, CLIENT_ACTIVITY_PAGE_SIZE),
		);
	});
});

describe("several entities' activity", () => {
	const A = "00000000-0000-4000-8000-00000000000a";
	const B = "00000000-0000-4000-8000-00000000000b";

	it("sends every id in one request, indexed, as the server reads it", async () => {
		const { client: api, calls } = fakeApi(() => empty({ total: 0 }));
		const options = entitiesActivityQuery(api, "roster_entry", [B, A]);
		await runPage(options);
		expect(calls).toHaveLength(1);
		const url = new URL(calls[0]?.path ?? "");
		expect(url.searchParams.get("entityType")).toBe("roster_entry");
		expect(url.searchParams.get("limit")).toBe(String(AGENT_ACTIVITY_LIMIT));
		// ts-rest writes an array indexed; avel-server reads it as repeated.
		expect(url.searchParams.get("entityId[0]")).toBe(A);
		expect(url.searchParams.get("entityId[1]")).toBe(B);
	});

	it("keys the same set the same way, whatever its order", () => {
		const { client: api } = fakeApi();
		expect(entitiesActivityQuery(api, "roster_entry", [B, A]).queryKey).toEqual(
			entitiesActivityQuery(api, "roster_entry", [A, B]).queryKey,
		);
	});

	it("never sends more ids than the contract takes, and nothing for none", async () => {
		const { client: api, calls } = fakeApi(() => empty({ total: 0 }));
		const many = Array.from(
			{ length: MAX_ENTITY_IDS + 5 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);
		await runPage(entitiesActivityQuery(api, "roster_entry", many));
		const sent = [...new URL(calls[0]?.path ?? "").searchParams.keys()].filter(
			(k) => k.startsWith("entityId"),
		);
		expect(sent).toHaveLength(MAX_ENTITY_IDS);
		expect(entitiesActivityQuery(api, "roster_entry", []).enabled).toBe(false);
	});
});

describe("a client's last activity", () => {
	const now = Date.parse("2026-10-09T12:00:00.000Z");

	it("is required by the contract, and may be null", () => {
		expect(clientSchema.safeParse(client(1)).success).toBe(true);
		expect(
			clientSchema.safeParse(client(1, { lastActivityAt: null })).success,
		).toBe(true);
		const { lastActivityAt: _, ...without } = client(1);
		expect(clientSchema.safeParse(without).success).toBe(false);
	});

	it("reads relative to now, or says there is none", () => {
		expect(lastActivityLabel(client(1), now)).toBe("Last activity 3 days ago");
		expect(lastActivityLabel(client(1, { lastActivityAt: null }), now)).toBe(
			"No activity yet",
		);
	});

	it("ends the banner's facts, never from updatedAt", () => {
		expect(clientFacts(client(1), now)).toBe(
			"Client since October 2026 · contact1@example.com · last activity 3 days ago",
		);
		expect(clientFacts(client(1, { lastActivityAt: null }), now)).toContain(
			"· no activity yet",
		);
	});
});
