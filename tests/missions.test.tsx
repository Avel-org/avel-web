import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	MISSION_STATUSES,
	type MissionDetail,
	type MissionListItem,
	type MissionStatus,
	missionDetail,
	missionListItem,
	missionStatusCounts,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionLabel } from "@/components/avel/activity-copy";
import { DataPanel } from "@/components/avel/data-panel";
import {
	MISSION_STATUS_TONE,
	missionColumns,
} from "@/components/avel/mission-columns";
import {
	type MissionListParams,
	missionListQuery,
	NEEDS_YOU_COPY,
} from "@/components/avel/mission-data";
import { flipDirection } from "@/components/avel/mission-filters";
import { panelStorageKey } from "@/components/avel/mission-panels";
import {
	MISSION_SEARCH_DEFAULTS,
	missionSearch,
	ORIGINS,
	STATUS_ORDER,
	STATUS_PANEL,
} from "@/components/avel/mission-search";
import {
	IN_FLIGHT_STATUSES,
	quietBefore,
} from "@/components/avel/mission-watch";
import { ApiError, ApiOverrideProvider, createApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { Route } from "@/routes/missions";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

// The mission details open in a Sheet, which portals; draw it in place so
// the server render shows what the drawer holds.
vi.mock("@/components/ui/sheet", () => import("./missions-sheet-inline"));

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas so they cannot drift
// from the shapes avel-server sends.

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function mission(
	n: number,
	status: MissionStatus,
	extra: Partial<MissionListItem> = {},
): MissionListItem {
	return missionListItem.parse({
		gateRunning: false,
		id: id(n),
		origin: "client",
		type: "template-booking",
		sprintN: n,
		status,
		cut: "vertical",
		cutSource: "derived",
		client: { id: id(900 + n), name: `Client ${n}` },
		engagement: { id: id(800 + n), name: `Engagement ${n}` },
		lastExport: null,
		lastActivityAt: "2026-10-06T09:00:00.000Z",
		needsYou: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		...extra,
	});
}

const ACTIVE = mission(1, "active", {
	needsYou: { reason: "pr_open" },
	lastExport: {
		id: id(501),
		status: "pr-open",
		targetKind: "github_pr",
		createdAt: "2026-10-06T08:00:00.000Z",
		statusChangedAt: "2026-10-06T10:00:00.000Z",
	},
});
const HALTED = mission(2, "halted", { lastActivityAt: null });
const DRAFT = mission(3, "draft", {
	client: null,
	engagement: null,
	origin: "client",
});

const COUNTS = {
	byStatus: missionStatusCounts.parse({
		draft: 1,
		active: 1,
		halted: 1,
		shipped: 0,
		archived: 0,
	}),
	needsYou: 1,
};

const DETAIL: MissionDetail = missionDetail.parse({
	activeGateJob: null,
	...ACTIVE,
	brief: { goal: "Ship the booking flow", pages: 4 },
	spendCeilingUsd: null,
	spentUsd: 0,
	cutRationale: null,
	repoUrl: "https://github.com/example/app",
	roster: { agents: 5, active: 3 },
	playbook: { missionType: "template-booking", name: "Template booking" },
	lastExport: { ...ACTIVE.lastExport, gates: null },
	recentActivity: [
		{
			action: "export.created",
			entityType: "export",
			at: "2026-10-06T08:00:00.000Z",
			actor: {
				kind: "system",
				userId: null,
				rosterEntryId: null,
				canonSessionId: null,
				display: null,
				agent: null,
			},
		},
		{
			action: "mission.updated",
			entityType: "mission",
			at: "2026-10-06T07:00:00.000Z",
			actor: {
				kind: "operator",
				userId: id(7),
				rosterEntryId: null,
				canonSessionId: null,
				display: "ada",
				agent: null,
			},
		},
	],
});

// ---------------------------------------------------------------------------
// Rendering: the real app through the real router, signed in, with a query
// cache seeded the way the browser's requests would fill it.

const base = (over: Partial<MissionListParams> = {}): MissionListParams => ({
	origin: "client",
	q: "",
	sort: "lastActivity",
	includeArchived: false,
	...over,
});

function page(
	rows: MissionListItem[],
	{
		nextCursor = null,
		counts = COUNTS,
		total = rows.length,
	}: {
		nextCursor?: string | null;
		counts?: typeof COUNTS;
		total?: number;
	} = {},
) {
	return {
		pages: [{ data: rows, meta: { nextCursor, counts, total } }],
		pageParams: [undefined],
	};
}

type Seed = (client: QueryClient) => void;

/** Every list the default page asks for, with the fixtures in place. */
const seeded: Seed = (client) => {
	client.setQueryData(
		queryKeys.missions.list(base()).slice(),
		page([ACTIVE, HALTED, DRAFT]),
	);
	client.setQueryData(
		queryKeys.missions.list(base({ needsYou: true })).slice(),
		page([ACTIVE]),
	);
	for (const status of MISSION_STATUSES) {
		const rows = [ACTIVE, HALTED, DRAFT].filter((m) => m.status === status);
		client.setQueryData(
			queryKeys.missions.list(base({ status: [status] })).slice(),
			page(rows),
		);
	}
};

async function render(path: string, seed: Seed = seeded): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			// No refetch on mount: a seeded error must render as the error it is.
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	seed(queryClient);
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

/** The panels on the page, in order, with their open states. */
function panels(html: string) {
	return [
		...html.matchAll(
			/<section data-testid="missions-panel-([a-z-]+)" data-state="(open|closed)"/g,
		),
	].map((m) => [m[1], m[2]]);
}

/** From an element's opening tag to the end of the section holding it. */
function region(html: string, testid: string): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	expect(start, testid).toBeGreaterThan(-1);
	return html.slice(start, html.indexOf("</section>", start));
}

/** A panel's table alone: the phone cards beside it repeat its cells. */
function tableOf(html: string, panel: string): string {
	const start = html.indexOf(`data-testid="${panel}-table-table"`);
	expect(start, panel).toBeGreaterThan(-1);
	return html.slice(start, html.indexOf("</table>", start));
}

/** Where the server sends `path`: null to render, or a 307's Location. */
async function serverRedirect(path: string): Promise<string | null> {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	const result = (
		router as unknown as {
			_serverResult?: { type: string; redirect?: { headers?: Headers } };
		}
	)._serverResult;
	return result?.type === "redirect"
		? (result.redirect?.headers?.get("Location") ?? null)
		: null;
}

// ---------------------------------------------------------------------------

describe("the URL holds the page's state", () => {
	it("defaults every key when the URL has none", () => {
		expect(missionSearch.parse({})).toEqual(MISSION_SEARCH_DEFAULTS);
	});

	it("knows the contract's statuses, the needs-you lens and All, and nothing else", () => {
		for (const status of ["all", "needs-you", ...MISSION_STATUSES]) {
			expect(missionSearch.parse({ status }).status).toBe(status);
		}
		expect(missionSearch.parse({ status: "failed" }).status).toBe("all");
	});

	it("falls back on anything it does not know", () => {
		expect(
			missionSearch.parse({
				origin: "all",
				sort: "random",
				view: "kanban",
				archived: "yes",
				mission: "not-a-uuid",
			}),
		).toEqual(MISSION_SEARCH_DEFAULTS);
	});

	it("is never all origins: internal and client missions are never listed together", async () => {
		expect([...ORIGINS]).toEqual(["client", "internal"]);
		expect(await serverRedirect("/missions?origin=all")).toBe("/missions");
	});

	it("redirects a link with an unknown or default value to its canonical form", async () => {
		expect(await serverRedirect("/missions?view=grouped")).toBe("/missions");
		expect(await serverRedirect("/missions?status=failed")).toBe("/missions");
		expect(await serverRedirect("/missions?view=tree")).toBeNull();
		// Table was a view once: a stale link falls back to grouped.
		expect(await serverRedirect("/missions?view=table")).toBe("/missions");
		expect(await serverRedirect(`/missions?mission=${id(1)}`)).toBeNull();
	});
});

describe("panels follow the contract's statuses", () => {
	it("has a panel for every status, and no others", () => {
		expect(Object.keys(STATUS_PANEL).sort()).toEqual(
			[...MISSION_STATUSES].sort(),
		);
		expect([...STATUS_ORDER].sort()).toEqual([...MISSION_STATUSES].sort());
		expect(Object.keys(MISSION_STATUS_TONE).sort()).toEqual(
			[...MISSION_STATUSES].sort(),
		);
	});

	it("calls a halted mission halted, in the block tone, never failed", () => {
		expect(STATUS_PANEL.halted).toEqual({
			label: "Halted",
			tone: "block",
			defaultOpen: true,
		});
	});

	it("comes in action order, Shipped closed, Archived hidden", async () => {
		// Needs you has its own panel in the side column, so the list starts
		// at the statuses rather than listing those missions twice.
		expect(panels(await render("/missions"))).toEqual([
			["active", "open"],
			["halted", "open"],
			["draft", "open"],
			["shipped", "closed"],
		]);
	});

	it("shows Archived, closed and last, once archived missions are included", async () => {
		const html = await render("/missions?archived=true", (client) => {
			for (const status of MISSION_STATUSES) {
				client.setQueryData(
					queryKeys.missions
						.list(base({ includeArchived: true, status: [status] }))
						.slice(),
					page([]),
				);
			}
		});
		expect(panels(html).at(-1)).toEqual(["archived", "closed"]);
	});

	it("shows only the chosen panel when the status is filtered", async () => {
		for (const status of ["halted", "needs-you"]) {
			const html = await render(`/missions?status=${status}`);
			expect(panels(html).map(([panel]) => panel)).toEqual([status]);
		}
	});

	it("remembers each panel under the shared avel. namespace", () => {
		expect(panelStorageKey("needs-you")).toBe("avel.missions.panel.needs-you");
		expect(panelStorageKey("halted")).toBe("avel.missions.panel.halted");
	});
});

describe("the data in the grouped view", () => {
	it("counts every status card from meta.counts", async () => {
		const html = await render("/missions");
		const count = (card: string) =>
			html.match(
				new RegExp(`data-testid="missions-card-${card}-count"[^>]*>(\\d+)<`),
			)?.[1];
		expect(count("needs-you")).toBe("1");
		expect(count("halted")).toBe("1");
		expect(count("shipped")).toBe("0");
		expect(html).not.toContain('data-testid="missions-card-archived"');
	});

	it("puts each mission in its status's panel, and the needs-you one in Needs you too", async () => {
		const html = await render("/missions");
		expect(region(html, "missions-panel-active")).toContain(
			`missions-panel-active-table-row-${ACTIVE.id}`,
		);
		expect(region(html, "missions-panel-halted")).toContain(
			`missions-panel-halted-table-row-${HALTED.id}`,
		);
		// The Needs you card narrows the list to its group.
		const lens = await render("/missions?status=needs-you");
		expect(region(lens, "missions-panel-needs-you")).toContain(
			`missions-panel-needs-you-table-row-${ACTIVE.id}`,
		);
		expect(region(lens, "missions-panel-needs-you")).not.toContain(HALTED.id);
	});

	it("says why a mission needs you, and keys that copy on the contract's reasons", async () => {
		const html = await render("/missions");
		// The words themselves, not the table they come from: a test that read
		// NEEDS_YOU_COPY would pass whatever the copy said.
		expect(region(html, "missions-needs-you")).toContain("Pull request open");
		expect(Object.keys(NEEDS_YOU_COPY).sort()).toEqual([
			"export_previewed",
			"pr_open",
		]);
	});

	it("drops the status column inside a status panel, which already says it", async () => {
		const html = await render("/missions");
		expect(tableOf(html, "missions-panel-halted")).not.toContain(
			'data-testid="mission-status"',
		);
		const lens = await render("/missions?status=needs-you");
		expect(tableOf(lens, "missions-panel-needs-you")).toContain(
			'data-testid="mission-status"',
		);
		// Nested in the Missions panel the why column goes: the last export's
		// pill already says it.
		expect(tableOf(lens, "missions-panel-needs-you")).not.toContain(">Why<");
	});

	it("shows an internal mission's missing client as a subtle dash, said in words", async () => {
		const row = region(await render("/missions"), "missions-panel-draft");
		expect(row).toMatch(
			/<span aria-hidden="true">—<\/span><span class="sr-only">No client: an internal mission<\/span>/,
		);
	});

	it("says No activity yet rather than a time it does not have", async () => {
		expect(
			region(await render("/missions"), "missions-panel-halted"),
		).toContain("No activity yet");
	});

	it("shows the total in the top bar once counts are in", async () => {
		expect(await render("/missions")).toMatch(
			/data-testid="topbar-subtitle"[^>]*>3 missions</,
		);
	});

	it("offers Load more, with how many are shown of how many, while pages remain", async () => {
		// Every list in one scope carries the same counts (they ignore the
		// status filter), so the scope's list says 7 halted as well.
		const counts = { ...COUNTS, byStatus: { ...COUNTS.byStatus, halted: 7 } };
		const html = await render("/missions", (client) => {
			seeded(client);
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([ACTIVE, HALTED, DRAFT], { counts }),
			);
			client.setQueryData(
				queryKeys.missions.list(base({ status: ["halted"] })).slice(),
				page([HALTED], { nextCursor: "next", counts, total: 7 }),
			);
		});
		expect(region(html, "missions-panel-halted")).toMatch(/Showing 1 of 7/);
		expect(region(html, "missions-panel-halted")).toContain("Load more");
		expect(region(html, "missions-panel-active")).not.toContain("Load more");
	});

	it("greets a first run with an empty state instead of empty panels", async () => {
		const zero = {
			byStatus: missionStatusCounts.parse({
				draft: 0,
				active: 0,
				halted: 0,
				shipped: 0,
				archived: 0,
			}),
			needsYou: 0,
		};
		const html = await render("/missions", (client) => {
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([], { counts: zero }),
			);
		});
		expect(html).toContain('data-testid="missions-first-run"');
		expect(html).toContain("No client missions yet");
		expect(panels(html)).toEqual([]);
	});

	it("answers a search that kept nothing once, with a way to clear it", async () => {
		const zero = {
			byStatus: missionStatusCounts.parse({
				draft: 0,
				active: 0,
				halted: 0,
				shipped: 0,
				archived: 0,
			}),
			needsYou: 0,
		};
		const html = await render("/missions?q=zzzz", (client) => {
			client.setQueryData(
				queryKeys.missions.list(base({ q: "zzzz" })).slice(),
				page([], { counts: zero }),
			);
			// The page around the list reads every mission, search or not.
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([], { counts: COUNTS }),
			);
		});
		expect(html).toContain('data-testid="missions-no-match"');
		// The search narrows the list, never the status cards.
		const card = (id: string) =>
			html.match(
				new RegExp(`data-testid="missions-card-${id}-count"[^>]*>(\\d+)<`),
			)?.[1];
		expect(card("needs-you")).toBe("1");
		expect(card("halted")).toBe("1");
		expect(html).toContain("3 missions");
		expect(html).toContain('data-testid="missions-clear-search"');
		expect(html).not.toContain('data-testid="missions-first-run"');
		// One answer, not an empty note under every status group.
		expect(panels(html)).toEqual([]);
	});
});

describe("collapsing a strip hides it, and keeps its rows", () => {
	it("keeps a closed panel's rows mounted, inert, behind a 0fr grid row", () => {
		const html = renderToString(
			<DataPanel data-testid="p" title="Going quiet" defaultOpen={false}>
				<p data-testid="p-row">row</p>
			</DataPanel>,
		);
		expect(tagOf(html, "p")).toContain('data-state="closed"');
		const body = tagOf(html, "p-body");
		expect(body).toContain("inert");
		expect(body).toContain("grid-rows-[0fr]");
		expect(body).toContain("transition-[grid-template-rows]");
		// The rows are still there: collapsing hides, it does not unmount.
		expect(html).toContain('data-testid="p-row"');
	});

	it("stacks the strips in one column, so a collapsed strip shrinks to its header", async () => {
		// Side by side in a grid row, a collapsed strip stretched to its
		// sibling's height: an empty card, read as the rows being removed.
		const side = tagOf(await render("/missions"), "missions-dashboard-side");
		expect(side).toContain("lg:flex lg:min-w-0 lg:flex-col lg:gap-4");
		expect(side).not.toMatch(/grid-cols|\bgrid\b/);
	});
});

describe("the strips in the dashboard's side column", () => {
	it("set each row on two lines, end it in the row chevron, and show no id", async () => {
		const seed = (client: QueryClient) => {
			seeded(client);
			client.setQueryData(
				queryKeys.missions
					.list(base({ lastExportStatus: IN_FLIGHT_STATUSES }))
					.slice(),
				page([ACTIVE]),
			);
		};
		const html = await render("/missions", seed);
		const row = tagOf(html, `missions-watch-in-flight-row-${ACTIVE.id}`);
		// A narrow column: the mission, then its badges and time below.
		expect(row).toContain('data-compact="true"');
		expect(row).toContain(
			"flex min-h-10 w-full min-w-0 items-center gap-3 py-2",
		);
		expect(row).toContain("group/row");
		const strip = region(html, "missions-watch-in-flight");
		expect(visibleText(strip)).not.toMatch(UUID_FRAGMENT);
		// The export method gives way first, whole on hover (QA item c).
		expect(strip).toContain(
			'title="GitHub PR" class="min-w-0 truncate type-small text-text-muted"',
		);
	});
});

describe("what to keep an eye on", () => {
	// The strips measure from now: pin it, so quietBefore is the one seeded.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
	});
	afterEach(() => vi.useRealTimers());

	const QUIET_OLD = mission(10, "active", {
		lastActivityAt: new Date(NOW - 4 * 86_400_000).toISOString(),
	});
	const QUIET_NEVER = mission(11, "active", { lastActivityAt: null });
	const VERIFYING = mission(12, "active", {
		lastExport: {
			id: id(512),
			status: "verifying",
			targetKind: "github_pr",
			createdAt: new Date(NOW - 5 * 3_600_000).toISOString(),
			// Verifying for the last two hours of its five.
			statusChangedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
		},
	});

	const quietKey = () =>
		queryKeys.missions
			.list(
				base({
					status: ["active"],
					quietBefore: quietBefore(NOW),
					sort: "lastActivity",
					direction: "asc",
				}),
			)
			.slice();
	const inFlightKey = () =>
		queryKeys.missions
			.list(base({ lastExportStatus: IN_FLIGHT_STATUSES }))
			.slice();

	const withStrips =
		(
			quiet: MissionListItem[],
			moving: MissionListItem[],
			totals = { quiet: quiet.length, moving: moving.length },
		): Seed =>
		(client) => {
			seeded(client);
			client.setQueryData(quietKey(), page(quiet, { total: totals.quiet }));
			client.setQueryData(
				inFlightKey(),
				page(moving, { total: totals.moving }),
			);
		};

	it("sits in the side column beside the list, in both views", async () => {
		for (const path of ["/missions", "/missions?view=tree"]) {
			const html = await render(path, withStrips([QUIET_OLD], [ACTIVE]));
			const side = html.indexOf('data-testid="missions-dashboard-side"');
			const watch = html.indexOf('data-testid="missions-watch-quiet"');
			expect(watch, path).toBeGreaterThan(side);
			const views = html.indexOf(
				path.includes("tree")
					? 'data-testid="missions-tree-view"'
					: 'data-testid="missions-panels"',
			);
			expect(views, path).toBeGreaterThan(-1);
			expect(views).toBeLessThan(side);
		}
	});

	it("stays while a status is chosen, beside the card that chose it", async () => {
		const html = await render(
			"/missions?status=halted",
			withStrips([QUIET_OLD], [ACTIVE]),
		);
		expect(html).toContain('data-testid="missions-watch-quiet"');
		expect(tagOf(html, "missions-card-halted")).toContain(
			'aria-pressed="true"',
		);
	});

	it("names how long each mission has been quiet, from the server's quiet list", async () => {
		const html = await render(
			"/missions",
			withStrips([QUIET_NEVER, QUIET_OLD], []),
		);
		const strip = region(html, "missions-watch-quiet");
		expect(strip).toContain(`missions-watch-quiet-row-${QUIET_NEVER.id}`);
		expect(strip).toContain("No activity yet");
		expect(strip).toContain("No activity for 4 days");
		expect(strip).toMatch(/data-testid="missions-watch-quiet-count"[^>]*>2</);
	});

	it("shows five and says how many there are, from meta.total", async () => {
		const many = Array.from({ length: 6 }, (_, i) =>
			mission(20 + i, "active", { lastActivityAt: null }),
		);
		const strip = region(
			await render("/missions", withStrips(many, [], { quiet: 12, moving: 0 })),
			"missions-watch-quiet",
		);
		expect(strip.match(/missions-watch-quiet-row-/g)).toHaveLength(5);
		expect(strip).toContain("Showing 5 of 12");
		expect(strip).toContain('data-testid="missions-watch-quiet-more"');
		expect(strip).toMatch(/data-testid="missions-watch-quiet-count"[^>]*>12</);
	});

	it("shows each delivery in flight with its status, target and how long", async () => {
		const strip = region(
			await render("/missions", withStrips([], [VERIFYING])),
			"missions-watch-in-flight",
		);
		expect(strip).toMatch(/data-tone="pending"[^>]*>[\s\S]*?Verifying/);
		expect(strip).toContain(">GitHub PR<");
		// In the shared time column, so it lines up with the tree's.
		expect(strip).toMatch(
			/data-testid="missions-watch-in-flight-time"[^>]*><time[^>]*>2 hours ago</,
		);
		expect(strip).not.toContain("Waiting on you");
	});

	it("marks a preview or an open pull request as waiting on you", async () => {
		const strip = region(
			await render("/missions", withStrips([], [ACTIVE])),
			"missions-watch-in-flight",
		);
		expect(strip).toContain('data-testid="missions-watch-waiting"');
		expect(strip).toContain("Waiting on you");
	});

	it("is quiet when there is nothing to show", async () => {
		const html = await render("/missions", withStrips([], []));
		expect(html).toContain("Nothing has gone quiet.");
		expect(html).toContain("Nothing in flight.");
	});
});

describe("the missions search", () => {
	it("is the shared search field, labelled, holding the URL's search", async () => {
		const html = await render("/missions?q=acme");
		const input = tagOf(html, "missions-search-input");
		expect(input).toMatch(/^<input[^>]*type="search"/);
		expect(input).toContain('value="acme"');
		expect(input).toContain('placeholder="Search missions"');
		expect(input).toContain('title="Search by client, engagement or type"');
		const id = input.match(/\sid="([^"]+)"/)?.[1];
		expect(html).toMatch(
			new RegExp(
				`<label[^>]*for="${id}"[^>]*>Search missions by client, engagement or type</label>`,
			),
		);
		// A search in the field offers the clear button.
		expect(html).toContain('data-testid="missions-search-clear"');
	});
});

describe("sort is a segmented track", () => {
	it("offers every sort as a pressed segment, with no dropdown", async () => {
		const html = await render("/missions");
		const track = tagOf(html, "missions-sort");
		expect(track).toMatch(/^<fieldset/);
		// v3 .segmented: the raised track, a chip for the pressed option.
		expect(track).toContain("bg-app-raised");
		expect(tagOf(html, "missions-sort-lastActivity")).toContain(
			'data-variant="segment"',
		);
		expect(tagOf(html, "missions-sort-lastActivity")).toContain(
			'aria-pressed="true"',
		);
		for (const sort of ["sprint", "client"]) {
			expect(tagOf(html, `missions-sort-${sort}`)).toContain(
				'aria-pressed="false"',
			);
		}
		expect(html).not.toContain('role="combobox"');
	});

	it("puts the direction in the same track, as its last segment", async () => {
		const html = await render("/missions");
		const track = html.slice(
			html.indexOf('data-testid="missions-sort"'),
			html.indexOf("</fieldset>", html.indexOf('data-testid="missions-sort"')),
		);
		expect(track).toContain('data-testid="missions-direction"');
		expect(tagOf(html, "missions-direction")).toContain(
			'data-variant="segment"',
		);
	});
});

describe("sorting both ways", () => {
	it("flips to the other direction, and back to the default leaves the URL", () => {
		expect(flipDirection("lastActivity", undefined)).toBe("asc");
		expect(flipDirection("lastActivity", "asc")).toBeUndefined();
		// Client sorts ascending by default, so its flip is descending.
		expect(flipDirection("client", undefined)).toBe("desc");
		expect(flipDirection("client", "desc")).toBeUndefined();
	});

	it("flips the direction beside the sort, and leaves the URL at the default", async () => {
		const plain = tagOf(await render("/missions"), "missions-direction");
		expect(plain).toContain('aria-label="Sorted descending. Sort ascending"');
		const asc = tagOf(
			await render("/missions?direction=asc", (client) => {
				for (const status of [undefined, ...MISSION_STATUSES]) {
					client.setQueryData(
						queryKeys.missions
							.list(
								base({
									direction: "asc",
									...(status ? { status: [status] } : {}),
								}),
							)
							.slice(),
						page([ACTIVE]),
					);
				}
			}),
			"missions-direction",
		);
		expect(asc).toContain('aria-label="Sorted ascending. Sort descending"');
	});
});

describe("the tree view", () => {
	const ENGAGED = mission(30, "active", {
		client: { id: id(901), name: "Client 1" },
		engagement: { id: id(801), name: "Engagement 1" },
	});

	it("is pressed in the toggle, beside Grouped, with no table controls left", async () => {
		const html = await render("/missions?view=tree");
		expect(tagOf(html, "missions-view-tree")).toContain('aria-pressed="true"');
		expect(html).not.toContain("missions-view-table");
		expect(html).not.toContain('data-testid="missions-density');
		expect(html).not.toContain('data-testid="missions-columns"');
	});

	it("groups client missions by client, then engagement, as a WAI-ARIA tree", async () => {
		const html = await render("/missions?view=tree", (client) => {
			seeded(client);
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([ACTIVE, ENGAGED, HALTED]),
			);
		});
		const tree = tagOf(html, "missions-tree");
		expect(tree).toMatch(/^<div[^>]*role="tree"/);
		const clientNode = tagOf(html, `mission-tree-client:${id(901)}`);
		expect(clientNode).toMatch(/role="treeitem"/);
		expect(clientNode).toContain('aria-level="1"');
		expect(clientNode).toContain('aria-expanded="true"');
		const engagement = tagOf(
			html,
			`mission-tree-engagement:${id(901)}/${id(801)}`,
		);
		expect(engagement).toContain('aria-level="2"');
		const leaf = tagOf(html, `mission-tree-leaf-${ENGAGED.id}`);
		expect(leaf).toContain('aria-level="3"');
		expect(leaf).toContain("data-mission-leaf");
	});

	it("gives one tree item the tab stop, the first, and the rest -1", async () => {
		const html = await render("/missions?view=tree");
		const items = [
			...html.matchAll(/role="treeitem"[^>]*tabindex="(-?\d)"/g),
		].map((m) => m[1]);
		expect(items[0]).toBe("0");
		expect(items.filter((t) => t === "0")).toHaveLength(1);
	});

	it("rolls up each group by status, a glyph and a word apiece", async () => {
		const html = await render("/missions?view=tree", (client) => {
			seeded(client);
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([ACTIVE, ENGAGED]),
			);
		});
		const node = region(html, `mission-tree-client:${id(901)}`);
		expect(node).toMatch(
			/data-testid="mission-tree-rollup-active"[^>]*>[\s\S]*?2 active</,
		);
		expect(node).not.toContain("mission-tree-rollup-halted");
		expect(node).not.toContain("·");
	});

	it("shows a mission's type, sprint, status, needs-you and last activity, never its id", async () => {
		const leaf = region(
			await render("/missions?view=tree"),
			`mission-tree-leaf-${ACTIVE.id}`,
		);
		expect(visibleText(leaf)).not.toMatch(UUID_FRAGMENT);
		expect(leaf).toContain(">template-booking<");
		expect(leaf).toContain('data-testid="mission-status"');
		expect(leaf).toContain('data-testid="mission-tree-needs-you"');
		expect(leaf).toContain("<time");
	});

	it("groups internal missions by type", async () => {
		const internal = mission(40, "draft", {
			origin: "internal",
			type: "benchmark",
			client: null,
			engagement: null,
		});
		const html = await render(
			"/missions?view=tree&origin=internal",
			(client) => {
				client.setQueryData(
					queryKeys.missions.list(base({ origin: "internal" })).slice(),
					page([internal]),
				);
			},
		);
		expect(tagOf(html, "mission-tree-type:benchmark")).toContain(
			'aria-level="1"',
		);
		expect(tagOf(html, `mission-tree-leaf-${internal.id}`)).toContain(
			'aria-level="2"',
		);
	});

	it("counts loaded missions as loaded until every page is in", async () => {
		const html = await render("/missions?view=tree", (client) => {
			seeded(client);
			client.setQueryData(
				queryKeys.missions.list(base()).slice(),
				page([ACTIVE], { nextCursor: "next", total: 9 }),
			);
		});
		expect(html).toMatch(/data-testid="mission-tree-count"[^>]*>1 loaded</);
		expect(tagOf(html, "missions-tree")).toContain(
			'aria-label="Missions, 1 of 9 loaded"',
		);
		expect(region(html, "missions-tree-view")).toMatch(/Showing 1 of 9/);
	});

	it("counts exactly once every page is in", async () => {
		const html = await render("/missions?view=tree");
		expect(html).toMatch(/data-testid="mission-tree-count"[^>]*>1</);
		expect(tagOf(html, "missions-tree")).toContain('aria-label="Missions"');
	});
});

describe("the tree, in steel", () => {
	const ENGAGED = mission(31, "active", {
		client: { id: id(931), name: "Client 31" },
		engagement: { id: id(831), name: "Engagement 31" },
	});
	const seed = (client: QueryClient) => {
		seeded(client);
		client.setQueryData(
			queryKeys.missions.list(base()).slice(),
			page([ENGAGED]),
		);
	};

	it("sets a client on a band header row, with a count badge", async () => {
		const html = await render("/missions?view=tree", seed);
		const client = region(html, `mission-tree-client:${id(931)}`);
		expect(client).toMatch(
			/data-testid="mission-tree-group-row" class="[^"]*h-10 border-border bg-app-hollow/,
		);
		expect(client).toMatch(
			/data-testid="mission-tree-count"[^>]*data-variant="count"|data-variant="count"[^>]*data-testid="mission-tree-count"/,
		);
	});

	it("sets an engagement one step quieter: no band", async () => {
		const html = await render("/missions?view=tree", seed);
		const row = html.slice(
			html.indexOf(
				'data-testid="mission-tree-group-row"',
				html.indexOf(`mission-tree-engagement:${id(931)}/${id(831)}`),
			),
		);
		const cls = /class="([^"]+)"/.exec(row)?.[1] ?? "";
		expect(cls).toContain("h-9 border-transparent");
		expect(cls).not.toContain("bg-app-band");
	});

	it("hangs children off a ruler, with a tick per child", async () => {
		const html = await render("/missions?view=tree", seed);
		expect(tagOf(html, "mission-tree-ruler")).toContain(
			"ml-4 flex flex-col gap-0.5 border-l border-border-strong pl-2",
		);
		const leaf = tagOf(html, `mission-tree-leaf-${ENGAGED.id}`);
		expect(leaf).toContain(
			"before:-left-2 before:h-px before:w-1 before:bg-border-strong",
		);
	});

	it("puts the open mission in v3's selected state, with an accent tick", async () => {
		const leaf = tagOf(
			await render(`/missions?view=tree&mission=${ENGAGED.id}`, seed),
			`mission-tree-leaf-${ENGAGED.id}`,
		);
		expect(leaf).toContain('aria-selected="true"');
		expect(leaf).toContain('data-selected="true"');
		expect(leaf).toContain("border-selected-border bg-selected");
		expect(leaf).toContain(
			"data-[selected]:before:w-1.5 data-[selected]:before:bg-accent",
		);
		const plain = tagOf(
			await render("/missions?view=tree", seed),
			`mission-tree-leaf-${ENGAGED.id}`,
		);
		expect(plain).toContain('aria-selected="false"');
		expect(plain).toContain("border-transparent hover:bg-app-raised");
	});

	it("rings the focused row, offset like a button's", async () => {
		const html = await render("/missions?view=tree", seed);
		expect(tagOf(html, `mission-tree-leaf-${ENGAGED.id}`)).toContain(
			"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
		);
		expect(tagOf(html, `mission-tree-client:${id(931)}`)).toContain(
			"focus-visible:[&amp;&gt;[data-tree-row]]:outline-2",
		);
	});
});

describe("the details panel", () => {
	const withDetail: Seed = (client) => {
		seeded(client);
		client.setQueryData(queryKeys.missions.detail(ACTIVE.id).slice(), DETAIL);
	};

	it("opens from the URL as a drawer from the right, with the mission's header", async () => {
		const html = await render(`/missions?mission=${ACTIVE.id}`, withDetail);
		// A Sheet over the page, never a column that reflows the grid.
		expect(tagOf(html, "mission-details")).toContain('data-sheet-side="right"');
		expect(html).not.toContain('data-testid="missions-layout"');
		const header = region(html, "mission-details-header");
		expect(visibleText(header)).not.toMatch(UUID_FRAGMENT);
		expect(header).toContain("Client 1");
		expect(header).toContain('data-testid="mission-status"');
	});

	it("opens on Details, with Brief and Activity as tabs, every fact in reach", async () => {
		const html = await render(`/missions?mission=${ACTIVE.id}`, withDetail);
		expect(tagOf(html, "mission-details-tab-details")).toContain(
			'aria-selected="true"',
		);
		for (const tab of ["brief", "activity"])
			expect(tagOf(html, `mission-details-tab-${tab}`)).toContain(
				'aria-selected="false"',
			);
		// Every fact is in the markup; the tabs only choose what shows.
		for (const section of [
			"brief",
			"roster",
			"playbook",
			"export",
			"activity",
			"spend",
		])
			expect(html).toContain(`data-testid="mission-section-${section}"`);
		// It scrolls as one column with no scrollbar drawn.
		expect(tagOf(html, "mission-details")).toMatch(/\bno-scrollbar\b/);
	});

	it("shows the brief as keys and values, without a typed shape", async () => {
		const brief = region(
			await render(`/missions?mission=${ACTIVE.id}`, withDetail),
			"mission-brief",
		);
		expect(brief).toContain(">goal<");
		expect(brief).toContain("Ship the booking flow");
		expect(brief).toMatch(/type-mono[^"]*">4</);
	});

	it("shows a brief in the contract's shape by requirement, as the full page does", async () => {
		const html = await render(`/missions?mission=${ACTIVE.id}`, (client) => {
			seeded(client);
			client.setQueryData(queryKeys.missions.detail(ACTIVE.id).slice(), {
				...DETAIL,
				brief: {
					summary: "A booking flow.",
					requirements: [{ id: "R1", text: "Patients book a slot." }],
					acceptanceCriteria: [
						{ id: "AC1", requirementId: "R1", text: "A free slot books." },
					],
				},
			});
		});
		const brief = region(html, "mission-section-brief");
		expect(brief).toContain('data-shape="plan"');
		expect(brief).toContain('data-testid="mission-brief-requirement-R1"');
		expect(brief).toContain("A free slot books.");
	});

	it("names each actor, or says System or Agent", async () => {
		const activity = region(
			await render(`/missions?mission=${ACTIVE.id}`, withDetail),
			"mission-activity",
		);
		expect(activity).toContain(">System<");
		expect(activity).toContain(">ada<");
	});

	it("words each action as the Activity page does, and an unknown one as sent", async () => {
		const activity = region(
			await render(`/missions?mission=${ACTIVE.id}`, withDetail),
			"mission-activity",
		);
		expect(activity).toContain(">Export created<");
		expect(activity).not.toContain(">export.created<");
		// missionActivity.action is any string; one with no copy reads as sent.
		expect(activity).toContain(">mission.updated<");
		expect(actionLabel("completion_report.filed")).toBe("Report filed");
		expect(actionLabel("toString")).toBe("toString");
	});

	it("says how long the last export has been in its status, from statusChangedAt", async () => {
		// Pinned: it entered pr-open at 10:00, two hours before NOW, after
		// being created at 08:00. Reading createdAt would say four hours.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		try {
			const html = await render(`/missions?mission=${ACTIVE.id}`, withDetail);
			expect(html).toMatch(
				/data-testid="mission-export-since"[^>]*>2 hours ago</,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("says no spend limit when none is set, and leaves gates to the mission page", async () => {
		const html = await render(`/missions?mission=${ACTIVE.id}`, withDetail);
		// The mission page's words, so the same fact reads the same way.
		expect(region(html, "mission-section-spend")).toContain("No spend limit");
		// Module 9 is built: the gate's results are the mission page's Gate
		// panel, so the side panel no longer stands in for them.
		expect(html).not.toContain('data-testid="mission-export-gates"');
	});

	it("answers a stale link with NOT_FOUND and a way back", async () => {
		const html = await render(`/missions?mission=${ACTIVE.id}`, (client) => {
			seeded(client);
			client
				.getQueryCache()
				.build(client, {
					queryKey: queryKeys.missions.detail(ACTIVE.id).slice(),
				})
				.setState({
					status: "error",
					fetchStatus: "idle",
					error: new ApiError({
						method: "GET",
						path: "/api/missions/:id",
						kind: "contract",
						status: 404,
						code: "NOT_FOUND",
						message: "for logs only",
						requestId: "req-1",
					}),
				});
		});
		expect(html).toContain('data-testid="surface-error"');
		expect(html).toContain('data-testid="mission-details-back"');
	});
});

describe("what the page asks avel-server for", () => {
	async function requested(params: MissionListParams, cursor?: string) {
		let url = "";
		const api = createApiClient({
			baseUrl: "http://avel.test",
			api: async (args) => {
				url = args.path;
				return {
					status: 200,
					body: {
						success: true,
						data: [],
						meta: { nextCursor: null, counts: COUNTS, total: 0 },
					},
					headers: new Headers({ "content-type": "application/json" }),
				};
			},
		});
		const options = missionListQuery(api, params);
		await options.queryFn?.({
			queryKey: options.queryKey,
			pageParam: cursor,
			signal: new AbortController().signal,
			meta: undefined,
			direction: "forward",
			client: new QueryClient(),
		} as never);
		return new URL(url).searchParams;
	}

	it("sends origin, sort and includeArchived always, and omits an empty search", async () => {
		const query = await requested(base());
		expect(query.get("origin")).toBe("client");
		expect(query.get("sort")).toBe("lastActivity");
		expect(query.get("includeArchived")).toBe("false");
		expect(query.has("q")).toBe(false);
		expect(query.has("needsYou")).toBe(false);
	});

	it("asks for needsYou=true only for the needs-you lens", async () => {
		expect((await requested(base({ needsYou: true }))).get("needsYou")).toBe(
			"true",
		);
	});

	it("repeats status, and passes the cursor through", async () => {
		const query = await requested(
			base({ status: ["active", "halted"] }),
			"abc",
		);
		// ts-rest sends arrays indexed (status[0]=…); avel-server reads both
		// that and a repeated key. What matters is the values, in order.
		expect(
			[...query.entries()]
				.filter(([key]) => key.startsWith("status"))
				.map(([, value]) => value),
		).toEqual(["active", "halted"]);
		expect(query.get("cursor")).toBe("abc");
	});

	it("asks for the quiet and in-flight sets by the server's own filters", async () => {
		const quiet = await requested(
			base({
				status: ["active"],
				quietBefore: "2026-10-03T12:00:00.000Z",
				sort: "lastActivity",
				direction: "asc",
			}),
		);
		expect(quiet.get("quietBefore")).toBe("2026-10-03T12:00:00.000Z");
		expect(quiet.get("direction")).toBe("asc");
		const moving = await requested(
			base({ lastExportStatus: IN_FLIGHT_STATUSES }),
		);
		expect(
			[...moving.entries()]
				.filter(([key]) => key.startsWith("lastExportStatus"))
				.map(([, value]) => value)
				.sort(),
		).toEqual([
			"delivering",
			"pr-open",
			"previewed",
			"previewing",
			"rendering",
			"verifying",
		]);
		expect(moving.has("direction")).toBe(false);
	});

	it("keys each list on its sort and direction, so a cursor never crosses them", () => {
		expect(queryKeys.missions.list(base({ direction: "asc" }))).not.toEqual(
			queryKeys.missions.list(base()),
		);
	});

	it("keys each list on its sort, so a new sort never reuses a cursor", () => {
		expect(queryKeys.missions.list(base({ sort: "client" }))).not.toEqual(
			queryKeys.missions.list(base()),
		);
	});
});

describe("the page", () => {
	it("works on a phone", () => {
		expect(Route.options.staticData?.device).toBe("capture");
	});

	it("offers New mission, enabled: it starts the intake a mission comes from", async () => {
		const html = await render("/missions");
		expect(tagOf(html, "missions-new")).not.toMatch(/\sdisabled=""/);
	});
});

describe("the mission tables' columns", () => {
	it("give every column but Last activity a fixed share, so each status group's table lines up", () => {
		const widths = Object.fromEntries(
			missionColumns(0).map((column) => [column.id, column.width]),
		);
		for (const id of ["client", "type", "sprint", "lastExport"])
			expect(widths[id], id).toBeDefined();
		expect(widths.lastActivity).toBeUndefined();
	});
});
