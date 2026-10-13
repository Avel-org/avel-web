import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { AgentTemplate, Preset } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { noMatchCopy } from "@/components/avel/preset-list";
import { ApiError, ApiOverrideProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import {
	PRESETS_PAGE_SIZE,
	type PresetCut,
	type PresetPage,
	presetCountLabel,
	presetSearchText,
	templateLabel,
} from "@/lib/api/presets";
import { SessionSourceProvider } from "@/lib/auth";
import { presetsSearch, Route } from "../src/routes/presets";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import {
	contractError,
	ID,
	preset,
	TEMPLATE,
	template,
	unreachable,
} from "./presets-fixtures";
import { renderPage, tagOf } from "./render-page";

type Seed = {
	path?: string;
	q?: string;
	cut?: PresetCut;
	/** The selected preset, or the error its fetch failed with. */
	detail?: Preset | ApiError;
	/** The catalog's templates, or the error the list failed with. */
	templates?: AgentTemplate[] | ApiError;
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
	queryClient.setQueryData(
		queryKeys.presets.list(PRESETS_PAGE_SIZE, { q: seed.q, cut: seed.cut }),
		{ pages: [first], pageParams: [undefined] },
	);
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
	const templatesKey = queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE);
	if (seed.templates instanceof ApiError) {
		queryClient
			.getQueryCache()
			.build(queryClient, { queryKey: templatesKey })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: seed.templates,
			});
	} else if (seed.templates) {
		queryClient.setQueryData(templatesKey, {
			pages: [{ data: seed.templates, meta: { nextCursor: null } }],
			pageParams: [undefined],
		});
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
		expect(tagOf(html, "presets-view-board")).toContain('aria-pressed="true"');
		expect(
			html.match(/data-testid="preset-board-skeleton-card"/g),
		).toHaveLength(3);
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
		expect(html).toContain('data-testid="presets-load-more"');
		expect(html).toMatch(/data-testid="presets-showing"[^>]*>Showing 1 of 40</);
	});

	it("keeps the definition when the route gives no total", async () => {
		const html = await renderSeeded({
			data: [preset(1), preset(2)],
			meta: { nextCursor: null },
		});
		expect(html).not.toContain('data-testid="topbar-subtitle"');
		expect(html).toContain('data-testid="topbar-definition"');
	});

	it("shows each row's name, cut, agent count and version, as a link", async () => {
		const html = await renderSeeded(
			one(preset(1, { cut: "horizontal", version: 3 })),
			{ path: "/presets?view=table" },
		);
		const row = tagOf(html, `preset-row-${ID(1)}`);
		expect(row).toMatch(/^<a/);
		expect(row).toContain(`preset=${ID(1)}`);
		expect(html).toMatch(
			new RegExp(`data-testid="preset-cut-${ID(1)}"[^>]*>Horizontal<`),
		);
		expect(html).toContain(">1 agent · v3<");
		expect(html).toContain(">Preset 1<");
	});

	it("is first-run only when nothing is filtered and nothing exists", async () => {
		const html = await renderSeeded({
			data: [],
			meta: { nextCursor: null, total: 0 },
		});
		expect(html).toContain('data-testid="presets-empty"');
		expect(html).not.toContain('data-testid="presets-no-match"');
	});

	it("says a search matched nothing, with a way to clear it", async () => {
		const html = await renderSeeded(
			{ data: [], meta: { nextCursor: null, total: 0 } },
			{ path: "/presets?q=zzz&cut=vertical", q: "zzz", cut: "vertical" },
		);
		expect(html).toContain('data-testid="presets-no-match"');
		expect(html).toContain('data-testid="presets-clear-filters"');
		expect(html).not.toContain('data-testid="presets-empty"');
		expect(tagOf(html, "presets-search")).toContain('value="zzz"');
		expect(tagOf(html, "presets-cut-vertical")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "presets-cut-all")).toContain('aria-pressed="false"');
	});

	it("counts a filtered list as matches", async () => {
		const html = await renderSeeded(one(preset(1), 2), {
			path: "/presets?cut=horizontal",
			cut: "horizontal",
		});
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>2 teams match</);
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

describe("the selected preset", () => {
	const selected = (p: Preset, extra: Seed = {}) =>
		renderSeeded(one(p), {
			path: `/presets?view=table&preset=${p.id}`,
			detail: p,
			templates: [template(1), template(2)],
			...extra,
		});

	it("shows the agents it saves, named from the catalog", async () => {
		const html = await selected(
			preset(1, {
				description: "Full build squad",
				agents: [
					{
						agentTemplateId: TEMPLATE(2),
						waves: ["C"],
						territory: "Web · checkout",
						writablePaths: ["src/checkout/**"],
						estimatedTokens: 90000,
					},
				],
			}),
		);
		expect(tagOf(html, "preset-detail-surface")).toContain(
			'data-state="success"',
		);
		const row = html.slice(html.indexOf('data-testid="preset-agent-0"'));
		expect(row).toContain(">Template 2<");
		expect(row).toContain(">template-2<");
		expect(row).toContain(">C<");
		expect(row).toContain(">Web · checkout<");
		expect(row).toContain(">src/checkout/**<");
		expect(row).toContain(">90,000<");
		expect(html).toContain(">Full build squad<");
		expect(html).not.toContain('data-testid="preset-template-unknown"');
	});

	it("names a template the catalog lacks by its short id, never the whole uuid", async () => {
		const missing = TEMPLATE(9);
		const html = await selected(
			preset(1, {
				agents: [
					{
						agentTemplateId: missing,
						waves: ["A"],
						territory: null,
						writablePaths: null,
						estimatedTokens: null,
					},
				],
			}),
		);
		const cell = html.slice(
			html.indexOf('data-testid="preset-template-unknown"'),
		);
		expect(cell).toContain(">Unknown agent<");
		expect(cell).toContain(`>${missing.slice(0, 8)}<`);
		expect(html).not.toContain(missing);
	});

	it("says when names could not load, rather than calling every template unknown", async () => {
		const html = await selected(preset(1), {
			templates: unreachable(),
		});
		expect(html).toContain('data-testid="preset-names-error"');
		expect(html).not.toContain(">Unknown agent<");
		expect(html).not.toContain(TEMPLATE(1));
	});

	it("shows unset fields in words, and the estimate as a default", async () => {
		const html = await selected(
			preset(1, {
				agents: [
					{
						agentTemplateId: TEMPLATE(1),
						waves: [],
						territory: null,
						writablePaths: null,
						estimatedTokens: null,
					},
				],
			}),
		);
		const row = html.slice(html.indexOf('data-testid="preset-agent-0"'));
		for (const text of [
			"None",
			"Whole project",
			"Agent&#x27;s",
			"Not set",
		]) {
			expect(row).toContain(`>${text}<`);
		}
		expect(html).toContain(">No description<");
		expect(html).toContain("Token estimates are defaults.");
	});

	it("offers Edit, enabled now that the contract can update one", async () => {
		const html = await selected(preset(1, { version: 4 }));
		expect(html).toContain(">v4 · updated 2026-10-05<");
		expect(tagOf(html, "preset-edit")).not.toMatch(/\sdisabled=""/);
	});

	it("fits a lg pane: prose headers and cells wrap, mono values do not (728e777)", async () => {
		const html = await selected(
			preset(1, {
				agents: [
					{
						agentTemplateId: TEMPLATE(1),
						waves: ["A"],
						territory: "Web · checkout",
						writablePaths: null,
						estimatedTokens: 90000,
					},
				],
			}),
		);
		const table = html.slice(
			html.indexOf('data-testid="preset-agents"'),
			html.indexOf("</table>"),
		);
		const header = (text: string) =>
			// `<th\s`, so `<thead` never matches.
			table.match(
				new RegExp(`<th\\s[^>]*>(?:(?!</th>).)*${text}.*?</th>`),
			)?.[0] ?? "";
		for (const text of [
			"Agent",
			"Territory",
			"Writable paths",
			"Est. tokens",
		]) {
			expect(header(text)).toMatch(
				new RegExp(`<span class="whitespace-normal">${text}<`),
			);
		}
		expect(header("Waves")).not.toContain("whitespace-normal");

		const cell = (testid: string) =>
			table.match(
				new RegExp(`<td[^>]*data-testid="${testid}"[^>]*>(?:(?!</td>).)*`),
			)?.[0] ?? "";
		expect(cell("preset-agent-territory-0")).toContain(
			'<span class="whitespace-normal">Web · checkout<',
		);
		expect(cell("preset-agent-paths-0")).toContain(
			'<span class="whitespace-normal">',
		);
		// The token count and waves are mono values: never wrapped.
		const row = table.slice(table.indexOf('data-testid="preset-agent-0"'));
		expect(row).toMatch(/<td[^>]*>A<\/td>/);
		expect(row).toMatch(/<td[^>]*>90,000<\/td>/);
	});

	it("narrows the list pane at lg so the detail's table fits", async () => {
		const html = await renderSeeded(one(preset(1)), {
			path: "/presets?view=table",
		});
		const pane = tagOf(html, "presets-list-pane");
		expect(pane).toMatch(/\blg:w-72\b/);
		expect(pane).not.toMatch(/\blg:w-80\b/);
	});

	it("shows a gone preset as an error with the way back", async () => {
		const html = await renderSeeded(one(preset(1)), {
			path: `/presets?view=table&preset=${ID(7)}`,
			detail: contractError("NOT_FOUND", 404),
		});
		expect(tagOf(html, "preset-detail-surface")).toContain(
			'data-state="error"',
		);
		expect(html).toContain('data-testid="preset-back"');
	});
});

describe("the Presets views", () => {
	it("opens the table view from the URL, and the board without one", async () => {
		const table = await renderSeeded(one(preset(1)), {
			path: "/presets?view=table",
		});
		expect(tagOf(table, "presets-view-table")).toContain('aria-pressed="true"');
		expect(table).toContain('data-testid="presets-panes"');
		expect(table).not.toContain('data-testid="preset-cards"');

		const board = await renderSeeded(one(preset(1)));
		expect(board).toContain(`data-testid="preset-card-${ID(1)}"`);
		expect(board).not.toContain('data-testid="presets-panes"');
	});

	it("drops an unknown view rather than failing the page", () => {
		expect(presetsSearch.parse({ view: "graph" }).view).toBeUndefined();
		expect(presetsSearch.parse({ view: "table" }).view).toBe("table");
	});
});

describe("the Presets URL and copy", () => {
	it("drops a bad cut or preset id rather than failing the page", () => {
		expect(
			presetsSearch.parse({ cut: "diagonal", preset: "nope", q: "  " }),
		).toEqual({ cut: undefined, preset: undefined, q: undefined });
		expect(presetsSearch.parse({ cut: "vertical" }).cut).toBe("vertical");
	});

	it("trims the search and cuts it to the contract's limit", () => {
		expect(presetSearchText("  a  ")).toBe("a");
		expect(presetSearchText("x".repeat(250))).toHaveLength(200);
		expect(presetSearchText("   ")).toBeUndefined();
	});

	it("keys each search and cut apart, and leaves unset filters out", () => {
		expect(queryKeys.presets.list(50, {})).toEqual([
			"presets",
			"list",
			{ limit: 50 },
		]);
		expect(queryKeys.presets.list(50, { q: "a", cut: "vertical" })).toEqual([
			"presets",
			"list",
			{ limit: 50, q: "a", cut: "vertical" },
		]);
	});

	it("labels counts in the singular and as matches", () => {
		expect(presetCountLabel(1, false)).toBe("1 team");
		expect(presetCountLabel(3, true)).toBe("3 teams match");
		expect(noMatchCopy(undefined, "vertical")).toBe(
			"There are no vertical teams.",
		);
	});

	it("labels a known template by name and an unknown one by short id", () => {
		const byId = new Map([[TEMPLATE(1), { name: "Lead", slug: "lead" }]]);
		expect(templateLabel(TEMPLATE(1), byId)).toEqual({
			known: true,
			name: "Lead",
			slug: "lead",
		});
		expect(templateLabel(TEMPLATE(3), byId)).toEqual({
			known: false,
			shortId: "aaaaaaa3",
		});
	});
});
