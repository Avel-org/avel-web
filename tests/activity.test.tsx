import { QueryClient, type QueryFunctionContext } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type ActivityEntry,
	type AgentTemplate,
	activityAction,
	activityActorKind,
	activityEntityType,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ACTION_COPY,
	ACTOR_KIND_LABEL,
	ENTITY_LABEL,
} from "@/components/avel/activity-copy";
import { ActivityLog } from "@/components/avel/activity-log";
import { ApiOverrideProvider } from "@/lib/api";
import {
	ACTIVITY_PAGE_SIZE,
	type ActivityFilters,
	activityQuery,
	type useActivity,
} from "@/lib/api/activity";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { describeError } from "@/lib/error-map";
import { activitySearch, Route } from "../src/routes/activity";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { agent } from "./catalog-fixtures";
import { contractError, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(5000 + n).padStart(12, "0")}`;

function entry(
	n: number,
	overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
	return {
		id: ID(n),
		at: "2026-10-06T10:00:00.000Z",
		actorKind: "operator",
		actorUserId: ID(900),
		actorRosterEntryId: null,
		action: "client.created",
		entityType: "client",
		entityId: ID(100 + n),
		missionId: null,
		engagementId: null,
		requestId: `req-${n}`,
		payload: {},
		actor: { kind: "operator", display: "octo-operator" },
		...overrides,
	};
}

/** One page of the list, as the cache holds it. */
const pageOf = (rows: ActivityEntry[], total = rows.length, next = null) => ({
	pages: [{ data: rows, meta: { nextCursor: next, total } }],
	pageParams: [undefined],
});

/**
 * The real /activity page at `path`, with the activity list for `filters`
 * seeded, or nothing seeded (the list is then still loading: server
 * rendering never fetches).
 */
async function renderActivity(
	path: string,
	seed?: {
		filters: ActivityFilters;
		rows: ActivityEntry[];
		total?: number;
		/** The agent catalog, for naming agent_template entries; unread if absent. */
		catalog?: AgentTemplate[];
	},
) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	if (seed) {
		queryClient.setQueryData(
			queryKeys.activity.list(ACTIVITY_PAGE_SIZE, seed.filters),
			pageOf(seed.rows, seed.total),
		);
		if (seed.catalog)
			queryClient.setQueryData(
				queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE),
				{
					pages: [{ data: seed.catalog, meta: { nextCursor: null } }],
					pageParams: [undefined],
				},
			);
	}
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

/** Runs one page of an infinite query's queryFn, as the cache would. */
function runPage(
	options: { queryFn?: unknown; queryKey: readonly unknown[] },
	pageParam: string | undefined,
) {
	const fn = options.queryFn as (ctx: QueryFunctionContext) => Promise<unknown>;
	return fn({
		queryKey: options.queryKey,
		pageParam,
		signal: new AbortController().signal,
		meta: undefined,
	} as unknown as QueryFunctionContext);
}

describe("the Activity page", () => {
	it("keeps its device class: a capture route", () => {
		expect(Route.options.staticData?.device).toBe("capture");
	});

	it("shows a skeleton in the log's shape while loading", async () => {
		const html = await renderActivity("/activity");
		expect(tagOf(html, "activity-log")).toContain('data-state="loading"');
		expect(html.match(/data-testid="activity-log-skeleton-row"/g)).toHaveLength(
			4,
		);
		expect(html).not.toContain('data-testid="topbar-subtitle"');
	});

	it("says nothing has happened yet when the log is empty", async () => {
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [],
		});
		expect(tagOf(html, "activity-log")).toContain('data-state="empty"');
		expect(html).toContain('data-testid="activity-empty"');
		expect(html).not.toContain("activity-no-match");
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>0 entries</);
	});

	it("under a filter, says nothing matches and offers to clear it", async () => {
		const html = await renderActivity("/activity?actorKind=agent", {
			filters: { actorKind: "agent" },
			rows: [],
		});
		expect(tagOf(html, "activity-log")).toContain('data-state="empty"');
		expect(html).toContain('data-testid="activity-no-match"');
		expect(html).toContain('data-testid="activity-clear-filters"');
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>0 entries match</);
	});

	it("maps an error through the error map, by code", () => {
		const error = contractError(404, "NOT_FOUND");
		const query = {
			status: "error",
			error,
			refetch: () => {},
			isFetching: false,
		} as unknown as ReturnType<typeof useActivity>;
		const html = renderToString(
			<ActivityLog
				query={query}
				filtered={false}
				onClearFilters={() => {}}
				now={0}
			/>,
		);
		expect(tagOf(html, "activity-log")).toContain('data-state="error"');
		expect(html).toContain('data-testid="surface-error"');
		expect(html).toContain(describeError(error).what);
	});

	it("lists each entry: what, which, who and when, counted from meta.total", async () => {
		const mission = entry(1, {
			action: "mission.status_changed",
			entityType: "mission",
			entityId: ID(201),
		});
		const client = entry(2);
		const engagement = entry(3, {
			action: "engagement.closed",
			entityType: "engagement",
			actorKind: "system",
			actorUserId: null,
			actor: { kind: "system", display: "System" },
		});
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [mission, client, engagement],
			total: 120,
		});
		expect(tagOf(html, "activity-log")).toContain('data-state="success"');
		expect(html).toMatch(
			new RegExp(
				`data-testid="activity-action-${mission.id}"[^>]*>Mission status changed<`,
			),
		);
		// A mission opens its page; a client opens selected on Clients.
		expect(tagOf(html, `activity-target-${mission.id}`)).toContain(
			`href="/missions/${ID(201)}"`,
		);
		expect(tagOf(html, `activity-target-${client.id}`)).toContain(
			`href="/clients?client=${client.entityId}"`,
		);
		// No page for an engagement: plain text, not a link.
		expect(tagOf(html, `activity-target-${engagement.id}`)).toMatch(/^<span/);
		// When: relative, with the exact time on hover.
		const at = tagOf(html, `activity-at-${client.id}`);
		expect(at).toMatch(/^<time/);
		expect(at).toContain(`dateTime="${client.at}"`);
		expect(at).toContain(`title="${client.at}"`);
		expect(html).toMatch(
			/data-testid="activity-showing"[^>]*>Showing 3 of 120</,
		);
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>120 entries</);
		expect(html).toContain('data-testid="activity-filters"');
	});
});

describe("who acted", () => {
	it("shows the server's display for each kind and never shows an id as a name", async () => {
		const operator = entry(1, {
			actorUserId: ID(901),
			actor: { kind: "operator", display: "javaris500" },
		});
		const agent = entry(2, {
			actorKind: "agent",
			actorUserId: null,
			actorRosterEntryId: ID(902),
			actor: { kind: "agent", display: "Atlas · scheduling" },
		});
		const system = entry(3, {
			actorKind: "system",
			actorUserId: null,
			actor: { kind: "system", display: "System" },
		});
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [operator, agent, system],
		});
		for (const [row, display] of [
			[operator, "javaris500"],
			[agent, "Atlas · scheduling"],
			[system, "System"],
		] as const) {
			expect(html).toMatch(
				new RegExp(`data-testid="activity-actor-${row.id}"[^>]*>${display}<`),
			);
			expect(tagOf(html, `activity-actor-${row.id}`)).toContain(
				`data-actor-kind="${row.actor.kind}"`,
			);
		}
		// The display, not the kind: an operator is their login, an agent its name.
		expect(html).not.toMatch(
			/data-testid="activity-actor-[^"]*"[^>]*>Operator</,
		);
		expect(html).not.toMatch(/data-testid="activity-actor-[^"]*"[^>]*>Agent</);
		// Not as a name, not anywhere.
		expect(html).not.toContain(ID(901));
		expect(html).not.toContain(ID(902));
		expect(html).not.toMatch(
			/>[^<]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[^<]*</,
		);
	});
});

describe("the copy", () => {
	it("has words for every action in the contract, and no others", () => {
		expect(Object.keys(ACTION_COPY).sort()).toEqual(
			[...activityAction.options].sort(),
		);
		for (const text of Object.values(ACTION_COPY)) expect(text).not.toBe("");
	});

	it("names every entity type and actor kind in the contract", () => {
		expect(Object.keys(ENTITY_LABEL).sort()).toEqual(
			[...activityEntityType.options].sort(),
		);
		expect(Object.keys(ACTOR_KIND_LABEL).sort()).toEqual(
			[...activityActorKind.options].sort(),
		);
	});
});

describe("filtering", () => {
	it("gives each filter set its own cache entry, holding only the filters set", () => {
		const all = queryKeys.activity.list(ACTIVITY_PAGE_SIZE, {});
		const agents = queryKeys.activity.list(ACTIVITY_PAGE_SIZE, {
			actorKind: "agent",
		});
		const both = queryKeys.activity.list(ACTIVITY_PAGE_SIZE, {
			actorKind: "agent",
			entityType: "mission",
		});
		expect(agents).not.toEqual(all);
		expect(both).not.toEqual(agents);
		expect(all).toEqual(["activity", "list", { limit: ACTIVITY_PAGE_SIZE }]);
		expect(
			queryKeys.activity.list(ACTIVITY_PAGE_SIZE, { actorKind: undefined }),
		).toEqual(all);
		expect(all.slice(0, 1)).toEqual(queryKeys.activity.all());
	});

	it("starts a changed filter's list from no cursor, sending only the filters set", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [], meta: { nextCursor: "c2", total: 0 } },
		}));
		const all = activityQuery(api, {});
		await runPage(all, "c1");
		const agents = activityQuery(api, { actorKind: "agent" });
		// A new key starts where every infinite query starts: no page param.
		expect(agents.initialPageParam).toBeUndefined();
		await runPage(agents, agents.initialPageParam);
		expect(calls[0]?.path).toContain("cursor=c1");
		expect(calls[0]?.path).not.toMatch(/actorKind|entityType/);
		expect(calls[1]?.path).toContain("actorKind=agent");
		expect(calls[1]?.path).not.toContain("cursor=");
		expect(calls[1]?.path).not.toContain("entityType");
		expect(agents.queryKey).not.toEqual(all.queryKey);
	});

	it("reads the filters from the URL, dropping anything the contract does not take", () => {
		expect(
			activitySearch.parse({ entityType: "mission", actorKind: "agent" }),
		).toEqual({ entityType: "mission", actorKind: "agent" });
		expect(
			activitySearch.parse({ entityType: "nonsense", actorKind: 3 }),
		).toEqual({ entityType: undefined, actorKind: undefined });
	});

	it("shows the filters chosen in the URL", async () => {
		const html = await renderActivity("/activity?entityType=mission", {
			filters: { entityType: "mission" },
			rows: [entry(1, { entityType: "mission" })],
		});
		// A chosen value names its filter; an unset one says "All".
		expect(html).toMatch(
			/data-testid="activity-filter-entity"[\s\S]*?>Entity: Mission</,
		);
		expect(html).toMatch(
			/data-testid="activity-filter-actor"[\s\S]*?>All actors</,
		);
	});

	it("names each filter once set, and keeps both triggers one fixed width", async () => {
		const html = await renderActivity(
			"/activity?entityType=user&actorKind=agent",
			{ filters: { entityType: "user", actorKind: "agent" }, rows: [] },
		);
		expect(html).toMatch(
			/data-testid="activity-filter-entity"[\s\S]*?>Entity: User</,
		);
		expect(html).toMatch(
			/data-testid="activity-filter-actor"[\s\S]*?>Actor: Agent</,
		);
		// The same fixed width set or unset, so a choice never moves the other.
		const unset = await renderActivity("/activity", { filters: {}, rows: [] });
		for (const page of [html, unset]) {
			for (const id of ["activity-filter-entity", "activity-filter-actor"]) {
				expect(tagOf(page, id)).toMatch(/\sw-48\b/);
				expect(tagOf(page, id)).not.toMatch(/\sw-fit\b/);
			}
		}
	});
});

describe("an agent in the log", () => {
	const atlas = agent("atlas");
	const SHA = "ab".repeat(32);
	const regen = entry(1, {
		action: "agent_template.identity_regenerated",
		entityType: "agent_template",
		entityId: atlas.id,
		payload: { number: 3, sha256: SHA },
	});
	const gone = entry(2, {
		action: "agent_template.updated",
		entityType: "agent_template",
		entityId: ID(999),
		payload: {},
	});
	const target = (html: string, row: ActivityEntry) => {
		const start = html.indexOf(`data-testid="activity-target-${row.id}"`);
		const rest = html.slice(start);
		return rest.slice(0, rest.indexOf("</li>"));
	};

	it("names it from the catalog by its id, with the version it made and its hash", async () => {
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [regen, gone],
			catalog: [atlas],
		});
		const row = target(html, regen);
		expect(visibleText(row)).toContain("Atlas as atlas@v3");
		expect(row).toContain(`>${SHA.slice(0, 7)}<`);
		expect(row).toContain('href="/catalog/agents/atlas"');
		expect(row).toContain(`title="${atlas.id}"`);
		expect(visibleText(row)).not.toMatch(UUID_FRAGMENT);
		// Deleted since: the catalog lacks it, so it is "Agent", never its id.
		expect(visibleText(target(html, gone)).trim()).toMatch(/^Agent\b/);
		expect(visibleText(target(html, gone))).not.toMatch(UUID_FRAGMENT);
	});

	it("says Agent while the catalog loads", async () => {
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [regen],
		});
		const row = target(html, regen);
		expect(visibleText(row).trim()).toMatch(/^Agent\b/);
		expect(row).not.toContain("atlas@v3");
		expect(visibleText(row)).not.toMatch(UUID_FRAGMENT);
	});
});

describe("which entity", () => {
	it("underlines a linked entity at rest, so it reads apart from plain text", async () => {
		const mission = entry(1, { entityType: "mission" });
		const export_ = entry(2, { entityType: "export" });
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [mission, export_],
		});
		const link = tagOf(html, `activity-target-${mission.id}`);
		expect(link).toMatch(/^<a/);
		expect(link).toMatch(/\sunderline\s/);
		expect(link).toContain("decoration-border");
		expect(link).toContain("hover:decoration-current");
		const plain = tagOf(html, `activity-target-${export_.id}`);
		expect(plain).toMatch(/^<span/);
		expect(plain).not.toMatch(/underline|decoration-/);
	});

	it("names the entity by its type and the name it logged, never its id", async () => {
		const named = entry(1, { payload: { name: "Meridian Health" } });
		const unnamed = entry(2, { entityType: "mission" });
		const html = await renderActivity("/activity", {
			filters: {},
			rows: [named, unnamed],
		});
		// The target's own markup, from its opening tag to its closing one.
		const target = (row: ActivityEntry) => {
			const start = html.indexOf(`data-testid="activity-target-${row.id}"`);
			const rest = html.slice(start);
			return rest.slice(0, rest.search(/<\/(?:a|span)>\s*<\/(?:a|span)>/));
		};
		expect(visibleText(target(named))).toContain("Client Meridian Health");
		// The id stays on hover, for support, and is never the text.
		expect(target(named)).toContain(`title="${named.entityId}"`);
		for (const row of [named, unnamed]) {
			expect(visibleText(target(row))).not.toMatch(UUID_FRAGMENT);
		}
		expect(visibleText(target(unnamed)).trim()).toBe("Mission");
	});
});
