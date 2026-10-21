import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Client, MissionListItem } from "avel-server/contract";
import { Command } from "cmdk";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError, ApiProvider } from "@/lib/api";
import { CLIENTS_PAGE_SIZE } from "@/lib/api/clients";
import { queryKeys } from "@/lib/api/keys";
import { NOT_YET } from "@/lib/capabilities";
import { clientsSearch } from "../src/routes/clients";
import {
	type CommandHandlers,
	CommandMenu,
	goToEntries,
} from "../src/shell/command-palette";
import {
	parseRecent,
	pushRecent,
	RECENT_LIMIT,
	type RecentEntry,
} from "../src/shell/command-recent";
import {
	missionLabel,
	missionSearchParams,
	RESULTS_PER_GROUP,
} from "../src/shell/command-search";
import { ALL_LINKS } from "../src/shell/nav";
import { client, fakeApi } from "./clients-fixtures";
import { renderPage, tagOf } from "./render-page";

const NOOP: CommandHandlers = {
	openPage: () => {},
	openMission: () => {},
	openRecent: () => {},
	openClient: () => {},
	newClient: () => {},
	switchTheme: () => {},
	toggleSidebar: () => {},
	copyLink: () => {},
	signOut: () => {},
};

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(5000 + n).padStart(12, "0")}`;

function mission(
	n: number,
	origin: "client" | "internal",
	overrides: Partial<MissionListItem> = {},
): MissionListItem {
	return {
		id: ID(n),
		origin,
		type: "Feature",
		sprintN: n,
		status: "active",
		cut: "vertical",
		cutSource: "derived",
		client: origin === "client" ? { id: ID(900), name: `Acme ${n}` } : null,
		engagement: origin === "client" ? { id: ID(901), name: "Platform" } : null,
		lastExport: null,
		lastActivityAt: null,
		needsYou: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		...overrides,
	};
}

const COUNTS = {
	byStatus: { draft: 0, active: 0, halted: 0, shipped: 0, archived: 0 },
	needsYou: 0,
};

/** Seeds one origin's search results under the Missions page's own key. */
const seedMissions =
	(origin: "client" | "internal", q: string, rows: MissionListItem[]) =>
	(qc: QueryClient) =>
		qc.setQueryData(queryKeys.missions.list(missionSearchParams(origin, q)), {
			pages: [{ data: rows, meta: { nextCursor: null, counts: COUNTS } }],
			pageParams: [undefined],
		});

/**
 * The menu as the dialog renders it, inside cmdk's Command, with the real
 * ApiProvider (an API client that fails on any request) and a seeded cache.
 */
function menu(
	props: Partial<Parameters<typeof CommandMenu>[0]> = {},
	seed: (qc: QueryClient) => void = () => {},
	wrap: (node: ReactNode) => ReactNode = (node) => node,
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				staleTime: Number.POSITIVE_INFINITY,
				// A seeded error stays an error instead of refetching on mount.
				retryOnMount: false,
			},
		},
	});
	seed(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				{wrap(
					<Command>
						<CommandMenu
							search=""
							onSearchChange={() => {}}
							theme="dark"
							sidebarCollapsed={false}
							recent={[]}
							handlers={NOOP}
							{...props}
						/>
					</Command>,
				)}
			</QueryClientProvider>
		</ApiProvider>,
	);
}

const groupOrder = (html: string) =>
	[
		"command-results-client",
		"command-results-internal",
		"command-group-go",
		"command-group-create",
		"command-group-actions",
		"command-group-recent",
	]
		.map((id) => [id, html.indexOf(`data-testid="${id}"`)] as const)
		.filter(([, at]) => at >= 0)
		.sort((a, b) => a[1] - b[1])
		.map(([id]) => id);

const RECENT: RecentEntry[] = [
	{ kind: "page", to: "/clients", label: "Clients" },
	{
		kind: "mission",
		id: ID(1),
		origin: "client",
		label: "Acme 1, Feature, sprint 1",
	},
];

describe("the command menu's groups", () => {
	it("are in order: results, go to, create, actions, recent", () => {
		const html = menu({ search: "acme", recent: RECENT });
		expect(groupOrder(html)).toEqual([
			"command-results-client",
			"command-results-internal",
			"command-group-go",
			"command-group-create",
			"command-group-actions",
			"command-group-recent",
		]);
	});

	it("show no search results until something is typed", () => {
		const html = menu({ search: "   " });
		expect(html).not.toContain("command-results-");
	});

	it("leave out Recent when nothing has been opened yet", () => {
		expect(menu()).not.toContain("command-group-recent");
	});
});

describe("mission search results", () => {
	const seven = (origin: "client" | "internal") =>
		Array.from({ length: 7 }, (_, i) =>
			mission(i + (origin === "client" ? 1 : 20), origin),
		);

	it("search each origin separately, labelled, never mixed", () => {
		const html = menu({ search: "acme" }, (qc) => {
			seedMissions("client", "acme", [mission(1, "client")])(qc);
			seedMissions("internal", "acme", [mission(20, "internal")])(qc);
		});
		const client = html.slice(
			html.indexOf('data-testid="command-results-client"'),
			html.indexOf('data-testid="command-results-internal"'),
		);
		const internal = html.slice(
			html.indexOf('data-testid="command-results-internal"'),
			html.indexOf('data-testid="command-group-go"'),
		);
		expect(client).toContain("Client missions");
		expect(client).toContain(`command-mission-${ID(1)}`);
		expect(client).not.toContain(`command-mission-${ID(20)}`);
		expect(internal).toContain("Internal missions");
		expect(internal).toContain(`command-mission-${ID(20)}`);
		expect(internal).not.toContain(`command-mission-${ID(1)}`);
	});

	it("show at most five per group, each with its status as a pill", () => {
		const html = menu({ search: "acme" }, (qc) => {
			seedMissions("client", "acme", seven("client"))(qc);
			seedMissions("internal", "acme", seven("internal"))(qc);
		});
		const client = html.slice(
			html.indexOf('data-testid="command-results-client"'),
			html.indexOf('data-testid="command-results-internal"'),
		);
		expect(client.match(/data-testid="command-mission-/g)).toHaveLength(
			RESULTS_PER_GROUP,
		);
		expect(RESULTS_PER_GROUP).toBe(5);
		const first = client.slice(client.indexOf(`command-mission-${ID(1)}`));
		expect(first).toMatch(/data-testid="status-pill"[^>]*data-tone="pending"/);
		expect(first).toContain(">Active<");
	});

	it("search with the trimmed text, under the Missions page's own key", () => {
		// "  acme  " searches "acme": the seed for "acme" is what renders.
		const html = menu(
			{ search: "  acme  " },
			seedMissions("client", "acme", [mission(1, "client")]),
		);
		expect(html).toContain(`command-mission-${ID(1)}`);
	});

	it("say quietly that they are searching, then that nothing matched", () => {
		const loading = menu({ search: "acme" });
		expect(loading).toContain('data-testid="command-results-client-loading"');
		expect(loading).toContain(">Searching<");
		const empty = menu({ search: "acme" }, seedMissions("client", "acme", []));
		expect(empty).toMatch(
			/data-testid="command-results-client-empty"[^>]*>No matches\.</,
		);
	});

	it("say quietly when a search failed, without failing the menu", () => {
		const html = menu({ search: "acme" }, (qc) => {
			const query = qc.getQueryCache().build(qc, {
				queryKey: queryKeys.missions.list(
					missionSearchParams("internal", "acme"),
				),
			});
			query.setState({
				status: "error",
				fetchStatus: "idle",
				error: new ApiError({
					method: "GET",
					path: "/api/missions",
					kind: "unreachable",
				}),
			});
		});
		expect(html).toMatch(
			/data-testid="command-results-internal-error"[^>]*>Could not search internal missions\.</,
		);
		// The rest of the menu is still there.
		expect(html).toContain('data-testid="command-group-go"');
	});

	it("are kept by the server's match, not filtered again by the menu", () => {
		// The typed text is not in the item's words; force-mounting keeps it.
		const html = menu(
			{ search: "acme" },
			seedMissions("client", "acme", [mission(1, "client")]),
		);
		const item = tagOf(html, `command-mission-${ID(1)}`);
		expect(item).not.toMatch(/\shidden/);
	});

	it("read as client and type, or type alone for an internal mission", () => {
		expect(missionLabel(mission(3, "client"))).toBe(
			"Acme 3, Feature, sprint 3",
		);
		expect(missionLabel(mission(4, "internal"))).toBe("Feature, sprint 4");
		expect(missionSearchParams("internal", "x")).toEqual({
			origin: "internal",
			q: "x",
			sort: "lastActivity",
			includeArchived: false,
		});
	});
});

describe("client search results", () => {
	const clients = (n: number) =>
		Array.from({ length: n }, (_, i) => client(i + 1));
	const seedClients = (q: string, rows: Client[]) => (qc: QueryClient) =>
		qc.setQueryData(queryKeys.clients.list(CLIENTS_PAGE_SIZE, q), {
			pages: [{ data: rows, meta: { nextCursor: null, total: rows.length } }],
			pageParams: [undefined],
		});

	it("come from their own search query, at most five, each with its status", () => {
		const html = menu({ search: "acme" }, seedClients("acme", clients(7)));
		const group = html.slice(
			html.indexOf('data-testid="command-results-clients"'),
			html.indexOf('data-testid="command-group-go"'),
		);
		expect(group).toContain(">Clients<");
		expect(group.match(/data-testid="command-client-/g)).toHaveLength(5);
		const first = group.slice(group.indexOf(`command-client-${client(1).id}`));
		expect(first).toMatch(/data-testid="status-pill"[^>]*data-tone="pass"/);
		expect(first).toContain(">Client 1<");
	});

	it("sit after the mission groups and before Go to", () => {
		const html = menu({ search: "acme" }, seedClients("acme", clients(1)));
		const at = (id: string) => html.indexOf(`data-testid="${id}"`);
		expect(at("command-results-clients")).toBeGreaterThan(
			at("command-results-internal"),
		);
		expect(at("command-results-clients")).toBeLessThan(at("command-group-go"));
	});

	it("say quietly that they are searching, or that nothing matched", () => {
		expect(menu({ search: "acme" })).toContain(
			'data-testid="command-results-clients-loading"',
		);
		expect(menu({ search: "acme" }, seedClients("acme", []))).toMatch(
			/data-testid="command-results-clients-empty"[^>]*>No matches\.</,
		);
	});

	it("are not shown, or fetched, until something is typed", () => {
		expect(menu({ search: " " })).not.toContain("command-results-clients");
	});
});

describe("go to, create and actions", () => {
	const html = menu();

	it("offer every page", () => {
		for (const link of ALL_LINKS) {
			const id = link.to.slice(1).replaceAll("/", "-") || "home";
			expect(html).toContain(`data-testid="command-${id}"`);
		}
		expect(ALL_LINKS).toHaveLength(12);
	});

	it("find nested pages by their parent's name", () => {
		const repositories = goToEntries().find(
			(e) => e.link.to === "/settings/repositories",
		);
		expect(repositories?.words).toContain("Settings");
		expect(repositories?.words).toContain("Control");
	});

	it("create a client, and say why a mission cannot be created", () => {
		expect(tagOf(html, "command-new-client")).not.toMatch(
			/data-disabled="true"/,
		);
		const mission = tagOf(html, "command-new-mission");
		expect(mission).toMatch(/data-disabled="true"|aria-disabled="true"/);
		expect(html).toContain(NOT_YET["mission.create"]);
	});

	it("offer Open full page, with G F, only while a mission's panel is open (audit F6)", () => {
		expect(html).not.toContain("command-open-full-page");
		const open = menu({ handlers: { ...NOOP, openFullPage: () => {} } });
		expect(tagOf(open, "command-open-full-page")).toBeDefined();
		const item = open.slice(
			open.indexOf('data-testid="command-open-full-page"'),
		);
		expect(item.slice(0, item.indexOf("</div>"))).toMatch(
			/Open full page[\s\S]*>G F</,
		);
	});

	it("switch theme, toggle the sidebar with its shortcut, copy the link, sign out", () => {
		expect(html).toContain(">Switch to light theme<");
		expect(tagOf(html, "command-sidebar")).toBeDefined();
		expect(html).toMatch(/Collapse sidebar.*⌘B/s);
		expect(menu({ sidebarCollapsed: true })).toContain("Expand sidebar");
		expect(html).toContain('data-testid="command-copy-link"');
		expect(html).toContain('data-testid="command-sign-out"');
	});

	it("leave out the sidebar action when the shell gives no control", () => {
		const noSidebar = menu({ handlers: { ...NOOP, toggleSidebar: undefined } });
		expect(noSidebar).not.toContain("command-sidebar");
	});

	it("show how to drive it from the keyboard", () => {
		const footer = html.slice(html.indexOf('data-testid="command-footer"'));
		const keys = [
			...footer.matchAll(/<kbd[^>]*data-slot="kbd"[^>]*>([^<]+)</g),
		].map((m) => m[1]);
		expect(keys).toEqual(["↑↓", "↵", "esc"]);
		expect(footer).toContain("to move");
		expect(footer).toContain("to open");
		expect(footer).toContain("to close");
	});
});

describe("recent", () => {
	it("lists what was opened, newest first", () => {
		const html = menu({ recent: RECENT });
		const recent = html.slice(
			html.indexOf('data-testid="command-group-recent"'),
		);
		expect(recent.indexOf("command-recent-clients")).toBeLessThan(
			recent.indexOf(`command-recent-${ID(1)}`),
		);
	});

	it("moves a reopened entry to the top, keeps five, and drops nothing else", () => {
		const pages = Array.from(
			{ length: 6 },
			(_, i): RecentEntry => ({ kind: "page", to: `/p${i}`, label: `P${i}` }),
		);
		let list: RecentEntry[] = [];
		for (const page of pages) list = pushRecent(list, page);
		expect(list.map((e) => (e.kind === "page" ? e.to : e.id))).toEqual([
			"/p5",
			"/p4",
			"/p3",
			"/p2",
			"/p1",
		]);
		list = pushRecent(list, { kind: "page", to: "/p2", label: "P2" });
		expect(list.map((e) => (e.kind === "page" ? e.to : ""))).toEqual([
			"/p2",
			"/p5",
			"/p4",
			"/p3",
			"/p1",
		]);
		expect(RECENT_LIMIT).toBe(5);
	});

	it("trusts nothing it reads back from storage", () => {
		expect(parseRecent(null)).toEqual([]);
		expect(parseRecent("not json")).toEqual([]);
		expect(parseRecent('{"kind":"page"}')).toEqual([]);
		const mixed = JSON.stringify([
			{ kind: "page", to: "/clients", label: "Clients" },
			{ kind: "page", to: "https://evil.example", label: "Off-site" },
			{ kind: "mission", id: "not-a-uuid", origin: "client", label: "x" },
			{ kind: "mission", id: ID(1), origin: "both", label: "x" },
			{ kind: "script", to: "/x", label: "x" },
		]);
		expect(parseRecent(mixed)).toEqual([
			{ kind: "page", to: "/clients", label: "Clients" },
		]);
	});
});

describe("the top-bar trigger", () => {
	it("is a Command icon named Command menu, on every page", async () => {
		const html = await renderPage("/missions");
		const trigger = tagOf(html, "global-search");
		expect(trigger).toContain('aria-label="Command menu"');
		expect(trigger).toContain('aria-keyshortcuts="Meta+K Control+K"');
		const inner = html.slice(html.indexOf('data-testid="global-search"'));
		expect(inner).toMatch(/^[^>]*>\s*<svg[^>]*lucide-command/);
	});
});

describe("New client from anywhere", () => {
	it("is a /clients search param, read only when it is exactly true", () => {
		expect(clientsSearch.parse({ new: true })).toEqual({ new: true });
		expect(clientsSearch.parse({})).toEqual({});
		expect(clientsSearch.parse({ new: "yes" })).toEqual({ new: undefined });
	});
});
