import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { Preset } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError, ApiOverrideProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import {
	PRESETS_PAGE_SIZE,
	type PresetPage,
	presetCountLabel,
	presetSearchText,
	templateLabel,
} from "@/lib/api/presets";
import { SessionSourceProvider } from "@/lib/auth";
import { presetsSearch, Route } from "../src/routes/presets";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { ID, preset, TEMPLATE, unreachable } from "./presets-fixtures";
import { renderPage, tagOf } from "./render-page";

type Seed = {
	path?: string;
	/** The selected preset, or the error its fetch failed with. */
	detail?: Preset | ApiError;
};

/** The real page with a seeded first page of presets, as Clients' tests do. */
async function renderSeeded(first: PresetPage, seed: Seed = {}) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	queryClient.setQueryData(queryKeys.presets.list(PRESETS_PAGE_SIZE, {}), {
		pages: [first],
		pageParams: [undefined],
	});
	const path = seed.path ?? "/presets";
	if (seed.detail instanceof ApiError) {
		const id = new URLSearchParams(path.split("?")[1]).get("preset") ?? "";
		queryClient
			.getQueryCache()
			.build(queryClient, { queryKey: queryKeys.presets.detail(id) })
			.setState({ status: "error", fetchStatus: "idle", error: seed.detail });
	} else if (seed.detail) {
		queryClient.setQueryData(
			queryKeys.presets.detail(seed.detail.id),
			seed.detail,
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

const one = (p: Preset, total = 1): PresetPage => ({
	data: [p],
	meta: { nextCursor: null, total },
});

describe("the Presets page", () => {
	it("is a construction route", () => {
		expect(Route.options.staticData?.device).toBe("construction");
	});

	it("is titled from the sidebar and prints no heading of its own", async () => {
		const html = await renderPage("/presets");
		expect(html).toContain("<title>Teams · AVEL</title>");
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
	});

	it("loads the board by default, never the not-built state", async () => {
		const html = await renderPage("/presets");
		expect(tagOf(html, "preset-list")).toContain('data-state="loading"');
		// The canvas's skeleton: five lanes in their real shape.
		expect(
			html.match(/data-testid="preset-canvas-skeleton-lane"/g),
		).toHaveLength(5);
		expect(html).not.toContain('data-state="not-built"');
	});

	it("offers New preset, enabled now that the contract can create one", async () => {
		const html = await renderPage("/presets");
		expect(tagOf(html, "presets-new")).not.toMatch(/\sdisabled=""/);
		expect(html).not.toContain("no preset.create route");
	});
});

describe("the Presets list", () => {
	it("counts from meta.total, not the rows loaded", async () => {
		const html = await renderSeeded({
			data: [preset(1)],
			meta: { nextCursor: "c1", total: 40 },
		});
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>40 teams</);
	});

	it("keeps the definition when the route gives no total", async () => {
		const html = await renderSeeded({
			data: [preset(1), preset(2)],
			meta: { nextCursor: null },
		});
		expect(html).not.toContain('data-testid="topbar-subtitle"');
		expect(html).toContain('data-testid="topbar-definition"');
	});

	it("is first-run when no team exists", async () => {
		const html = await renderSeeded({
			data: [],
			meta: { nextCursor: null, total: 0 },
		});
		expect(html).toContain('data-testid="presets-empty"');
	});

	it("never filters the board by an old link's ?q or ?cut", async () => {
		// The URL drops both (ruling 55): the board reads the unfiltered list.
		const html = await renderSeeded(one(preset(1), 3), {
			path: "/presets?q=zzz&cut=vertical",
			detail: preset(1),
		});
		expect(html).toContain('data-testid="preset-canvas"');
		expect(html).not.toContain('data-testid="presets-no-match"');
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>3 teams</);
	});

	it("maps a list error to the error map's copy", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, retryOnMount: false } },
		});
		queryClient
			.getQueryCache()
			.build(queryClient, {
				queryKey: queryKeys.presets.list(PRESETS_PAGE_SIZE, {}),
			})
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: unreachable(),
			});
		const router = createRouter({
			routeTree,
			history: createMemoryHistory({ initialEntries: ["/presets"] }),
		});
		await router.load();
		const html = renderToString(
			<SessionSourceProvider source={signedIn()}>
				<ApiOverrideProvider queryClient={queryClient}>
					<RouterProvider router={router} />
				</ApiOverrideProvider>
			</SessionSourceProvider>,
		);
		expect(tagOf(html, "preset-list")).toContain('data-state="error"');
		expect(html).toContain('data-testid="surface-error"');
	});
});

describe("the Presets URL and copy", () => {
	it("drops a bad preset id rather than failing the page", () => {
		expect(presetsSearch.parse({ preset: "nope" })).toEqual({
			preset: undefined,
		});
		expect(presetsSearch.parse({ preset: ID(1) }).preset).toBe(ID(1));
	});

	it("keeps no view, search or cut: an old ?view=table link parses to the board (ruling 55)", () => {
		expect(
			presetsSearch.parse({ view: "table", q: "atlas", cut: "vertical" }),
		).toEqual({});
		expect(
			presetsSearch.parse({ view: "table", section: "playbooks" }),
		).toEqual({ section: "playbooks" });
	});

	it("trims the search and cuts it to the contract's limit", () => {
		expect(presetSearchText("  a  ")).toBe("a");
		expect(presetSearchText("x".repeat(250))).toHaveLength(200);
		expect(presetSearchText("   ")).toBeUndefined();
	});

	it("keys each search apart, and leaves an unset search out", () => {
		expect(queryKeys.presets.list(50, {})).toEqual([
			"presets",
			"list",
			{ limit: 50 },
		]);
		expect(queryKeys.presets.list(50, { q: "a" })).toEqual([
			"presets",
			"list",
			{ limit: 50, q: "a" },
		]);
	});

	it("labels counts in the singular and the plural", () => {
		expect(presetCountLabel(1)).toBe("1 team");
		expect(presetCountLabel(3)).toBe("3 teams");
	});

	it("labels a known template by name and an unknown one by its id, for Copy", () => {
		const byId = new Map([[TEMPLATE(1), { name: "Lead", slug: "lead" }]]);
		expect(templateLabel(TEMPLATE(1), byId)).toEqual({
			known: true,
			name: "Lead",
			slug: "lead",
		});
		expect(templateLabel(TEMPLATE(3), byId)).toEqual({
			known: false,
			id: TEMPLATE(3),
		});
	});
});

describe("a team that can't be read", () => {
	it("keeps the switcher above the error (a stale ?preset=)", async () => {
		const gone = new ApiError({
			method: "GET",
			path: "/api/presets/:id",
			kind: "contract",
			status: 404,
			code: "NOT_FOUND",
			message: "for logs only",
			requestId: "req-1",
		});
		const html = await renderSeeded(one(preset(1)), {
			path: `/presets?preset=${ID(9)}`,
			detail: gone,
		});
		expect(tagOf(html, "preset-open")).toContain('data-state="error"');
		const header = tagOf(html, "preset-canvas-header");
		expect(header).toBeTruthy();
		expect(tagOf(html, "preset-switcher")).toContain(
			'aria-label="Choose a team"',
		);
		expect(html).not.toContain('data-testid="preset-open-table"');
		expect(html).toContain('data-testid="surface-error"');
	});
});
