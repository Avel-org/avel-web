import { readFileSync } from "node:fs";
import {
	createMemoryHistory,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { ROLES, WAVES } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentGraph } from "@/components/avel/catalog-agent-graph";
import {
	IdentityTab,
	ManifestTab,
	OverviewTab,
	VersionsTab,
} from "@/components/avel/catalog-agent-inspector";
import {
	AGENT_MISSING,
	agentStatus,
	artifactLabel,
	artifactsOf,
	edgesOf,
	isFirmAgent,
	ROLE_ARTIFACTS,
	sampleDispatch,
	sampleEdges,
	sampleOverview,
	sideOf,
	sideOfRole,
	territoriesOf,
} from "@/components/avel/catalog-agent-placeholders";
import {
	FIRM_WAVES,
	filterAgents,
	initialsOf,
	SAMPLE_COLUMNS,
	SIDE_TABS,
	sortAgents,
} from "@/components/avel/catalog-agent-table";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import {
	CATALOG_MISSING,
	sampleHistory,
} from "@/components/avel/catalog-placeholders";
import { CodeView } from "@/components/avel/code-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAgentTemplates } from "@/lib/api/catalog";
import { routeTree } from "../src/routeTree.gen";
import {
	AGENTS,
	agent,
	inProviders,
	internalError,
	renderSeeded,
	seededClient,
} from "./catalog-fixtures";
import { renderPage, tagOf } from "./render-page";

/*
 * /catalog/agents: the templates are live (GET /api/agent-templates, and
 * the panel by slug), rendered through the real router with a seeded
 * QueryClient. The graph's edges and four of the table's columns are still
 * labelled samples (AVEL-DESIGN.md rulings 32 and 34), derived from the live
 * template's own fields.
 */

// ---------------------------------------------------------------------------
// Markup helpers. The node environment has no DOM; tests read the markup.

/** One element from its opening tag to its matching close, by start index. */
function elementAt(html: string, start: number): string {
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed element at ${start}`);
}

/** One element by test id. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return elementAt(html, html.lastIndexOf("<", at));
}

/** An attribute value as React escapes it, back to text. */
const fromAttr = (value: string) =>
	value.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

type Region = { missing: string; start: number; end: number; html: string };

function regions(html: string): Region[] {
	return [...html.matchAll(/<[a-z0-9]+[^>]*data-sample-region="([^"]+)"/g)].map(
		(m) => {
			const start = m.index ?? 0;
			const body = elementAt(html, start);
			return {
				missing: fromAttr(m[1] ?? ""),
				start,
				end: start + body.length,
				html: body,
			};
		},
	);
}

function pills(html: string): { at: number; missing: string }[] {
	return [
		...html.matchAll(
			/<button[^>]*data-testid="sample-data"[^>]*data-missing="([^"]+)"/g,
		),
	].map((m) => ({ at: m.index ?? 0, missing: fromAttr(m[1] ?? "") }));
}

const ROUTES = new Set<string>([
	...Object.values(CATALOG_MISSING),
	...Object.values(AGENT_MISSING),
]);

/**
 * This page's labelling rule: every region opens with its own pill naming
 * its route; any further pill in a region (sample columns, or a region inside
 * it) also names a known route; no pill sits outside a region; and each real
 * element named sits outside every region.
 */
function expectLabelled(html: string, real: string[]) {
	const rs = regions(html);
	for (const region of rs) {
		expect(ROUTES.has(region.missing), region.missing).toBe(true);
		const body = region.html.slice(region.html.indexOf(">") + 1);
		expect(body.match(/data-testid="([^"]+)"/)?.[1]).toBe("sample-data");
		expect(pills(region.html)[0]?.missing).toBe(region.missing);
		for (const pill of pills(region.html)) {
			expect(ROUTES.has(pill.missing), pill.missing).toBe(true);
		}
	}
	for (const pill of pills(html)) {
		expect(
			rs.some((r) => pill.at > r.start && pill.at < r.end),
			`pill ${pill.missing} in a region`,
		).toBe(true);
	}
	for (const testid of real) {
		const at = html.indexOf(`data-testid="${testid}"`);
		expect(at, testid).toBeGreaterThan(-1);
		expect(
			rs.some((r) => at > r.start && at < r.end),
			`${testid} is real`,
		).toBe(false);
	}
}

// The tabs and the graph link to agents' pages, so they render in a router.
const tipRouter = createRouter({
	routeTree,
	history: createMemoryHistory({ initialEntries: ["/catalog/agents"] }),
});
const tip = (node: ReactNode) =>
	renderToString(
		<RouterContextProvider router={tipRouter}>
			<TooltipProvider>{node}</TooltipProvider>
		</RouterContextProvider>,
	);

/** Text content of the cells of one table row. */
const cellsOf = (row: string) =>
	[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
		(m[1] ?? "").replace(/<[^>]+>/g, ""),
	);

const noop = () => {};

const PATH = "/api/agent-templates";

/** The page with every template loaded, rendered once and shared. */
const rendered = new Map<string, Promise<string>>();
const page = (search = ""): Promise<string> => {
	const path = `/catalog/agents${search}`;
	let html = rendered.get(path);
	if (!html) {
		html = renderSeeded(path, seededClient({ agents: AGENTS }));
		rendered.set(path, html);
	}
	return html;
};

/** The console in a chosen view, with the list it reads seeded. */
function Console({ view }: { view: "table" | "graph" }) {
	const query = useAgentTemplates();
	return <CatalogAgents query={query} initialView={view} />;
}

// ---------------------------------------------------------------------------

describe("the agent samples", () => {
	it("place every role on at most one side, from its family", () => {
		expect(sideOfRole("fixture")).toBe("fixture");
		expect(sideOfRole("incident-response")).toBe("judge");
		expect(sideOfRole("schema")).toBe("author");
		expect(sideOfRole("domain")).toBe("author");
		expect(sideOfRole("backend-tests")).toBe("tester");
		expect(sideOfRole("spec-judgment")).toBe("judge");
		expect(sideOfRole("intake")).toBeNull();
		expect(sideOfRole("deploy")).toBeNull();
		for (const a of AGENTS) {
			const sides = new Set(a.roles.map(sideOfRole).filter(Boolean));
			expect(sides.size, a.slug).toBeLessThanOrEqual(1);
		}
		expect(sideOf(agent("atlas"))).toBe("author");
		expect(sideOf(agent("iyo"))).toBe("tester");
		expect(sideOf(agent("zane"))).toBe("judge");
		expect(sideOf(agent("canon"))).toBeNull();
	});

	it("name what every role in the contract produces and reads", () => {
		expect(Object.keys(ROLE_ARTIFACTS).sort()).toEqual([...ROLES].sort());
	});

	it("draw an edge exactly where a producer's output is a consumer's input", () => {
		const edges = sampleEdges(AGENTS);
		expect(edges.length).toBeGreaterThan(0);
		for (const edge of edges) {
			expect(edge.from).not.toBe(edge.to);
			const writes = artifactsOf(agent(edge.from)).writes.map((a) => a.name);
			const reads = artifactsOf(agent(edge.to)).reads.map((a) => a.name);
			for (const a of edge.artifacts) {
				expect(writes).toContain(a.name);
				expect(reads).toContain(a.name);
			}
		}
		expect(
			edges
				.find((e) => e.from === "leonora" && e.to === "atlas")
				?.artifacts.map((a) => a.name)
				.sort(),
		).toEqual(["contract.ts", "migrations"]);
		expect(edges.some((e) => e.to === "zane")).toBe(false);
	});

	it("label an artifact with its name and the first four of its hash", () => {
		const contract = artifactsOf(agent("leonora")).writes.find(
			(a) => a.name === "contract.ts",
		);
		expect(contract && artifactLabel(contract)).toMatch(
			/^contract\.ts@[0-9a-f]{4}$/,
		);
	});

	it("set each estimate under its soft ceiling, under its hard one", () => {
		for (const a of AGENTS) {
			const d = sampleDispatch(a);
			expect(d.estimate).toBeLessThan(d.softCeiling);
			expect(d.softCeiling).toBeLessThan(d.hardCeiling);
		}
	});

	it("give a feature agent one or two territories by its slug, a horizontal agent none", () => {
		for (const a of AGENTS) {
			const territories = territoriesOf(a);
			if (a.kind === "feature") {
				expect(territories.length, a.slug).toBeGreaterThanOrEqual(1);
				expect(territories.length, a.slug).toBeLessThanOrEqual(2);
			} else {
				expect(territories, a.slug).toEqual([]);
			}
			// From the outcome rows, so the table and the measures agree.
			expect(territories).toEqual([
				...new Set(
					sampleHistory(a)
						.outcomes.map((r) => r.territory)
						.filter((t) => t !== null),
				),
			]);
		}
		expect(territoriesOf(agent("atlas"))).toEqual(
			territoriesOf(agent("atlas")),
		);
	});

	it("judge the status box by rule: good only with no violations and no halts", () => {
		const base = {
			firstPassGateRate: 0.5,
			tokensActual: 1,
			tokensEstimate: 1,
			boundaryViolations: 0,
			blockersFiled: 9,
			halts: 0,
		};
		expect(agentStatus(base)).toEqual({ ok: true, problems: [] });
		expect(agentStatus({ ...base, boundaryViolations: 2 })).toEqual({
			ok: false,
			problems: ["2 boundary violations"],
		});
		expect(agentStatus({ ...base, halts: 1, boundaryViolations: 1 })).toEqual({
			ok: false,
			problems: ["1 boundary violation", "1 run halted at a ceiling"],
		});
	});
});

describe("filtering and sorting", () => {
	it("filters by side tab, kind, wave and search, together", () => {
		const slugs = (f: Parameters<typeof filterAgents>[1]) =>
			filterAgents(AGENTS, f)
				.map((a) => a.slug)
				.sort();
		expect(slugs({ side: "judge" })).toEqual(["brennan", "zane"]);
		expect(slugs({ side: "firm" })).toEqual(["canon"]);
		expect(slugs({ wave: "C" })).toEqual(["iyo", "nemi"]);
		// Canon's template says wave A, but a firm agent joins no wave.
		expect(slugs({ wave: "A" })).toEqual(["leonora"]);
		expect(slugs({ kind: "feature", side: "author", wave: "B" })).toEqual([
			"atlas",
			"leon",
		]);
		// Search matches the name, the slug or a role.
		expect(slugs({ q: "ATL" })).toEqual(["atlas"]);
		expect(slugs({ q: "contract" })).toEqual(["leonora"]);
		expect(slugs({ q: "  " })).toHaveLength(AGENTS.length);
	});

	it("sorts by wave, side or name, breaking ties by wave then name", () => {
		const byWave = sortAgents(AGENTS, { column: "wave", direction: "asc" });
		// Firm agents have no waves, so they sort after every wave.
		const waves = byWave.map((a) =>
			isFirmAgent(a) ? WAVES.length : WAVES.indexOf(a.waveDefaults[0] ?? "A"),
		);
		expect(waves).toEqual([...waves].sort((x, y) => x - y));
		expect(byWave[0]?.slug).toBe("leonora");
		expect(byWave.at(-1)?.slug).toBe("canon");
		const bySide = sortAgents(AGENTS, { column: "side", direction: "asc" });
		expect(bySide.at(-1)?.slug).toBe("canon");
		const byName = sortAgents(AGENTS, { column: "name", direction: "desc" });
		expect(byName.map((a) => a.name)).toEqual(
			AGENTS.map((a) => a.name)
				.sort()
				.reverse(),
		);
	});
});

describe("/catalog/agents: the table", () => {
	it("renders the same page for the same data on every visit", async () => {
		const once = () =>
			renderSeeded("/catalog/agents", seededClient({ agents: AGENTS }));
		expect(await once()).toBe(await once());
	});

	it("puts no pill on the live table, and names what each sample column waits for", async () => {
		const html = await page();
		expectLabelled(html, [
			"catalog-agents-read-only",
			"catalog-agents-view",
			"catalog-agents-table",
		]);
		// The rows are live: no region, no pill, anywhere in the table view.
		expect(html).not.toContain("data-sample-region=");
		expect(html).not.toContain('data-testid="sample-data"');
		const table = element(html, "catalog-agents-table");
		for (const c of SAMPLE_COLUMNS) {
			const header = element(table, `catalog-agents-sample-column-${c.column}`);
			// In a column header, underlined dashed, naming what it waits for.
			expect(
				table.lastIndexOf(
					"<th",
					table.indexOf(`catalog-agents-sample-column-${c.column}`),
				),
			).toBeGreaterThan(-1);
			expect(ROUTES.has(c.missing), c.column).toBe(true);
			expect(fromAttr(header)).toContain(`data-missing="${c.missing}"`);
			expect(header).toMatch(/class="[^"]*\bborder-dashed\b/);
			expect(fromAttr(header)).toContain(
				`, Sample data until avel-server has ${c.missing}.`,
			);
		}
	});

	it("keeps every sr-only reason inside the table's scroll box", async () => {
		// sr-only text is absolute. Inside a column the table scrolls past, it
		// must be positioned against its own header or cell, or it stretches
		// the canvas (it did, by 191px, at 768).
		const html = await page();
		for (const id of [
			...SAMPLE_COLUMNS.map((c) => `catalog-agents-sample-column-${c.column}`),
			"catalog-agent-waves-canon",
		]) {
			const classes = tagOf(html, id)
				.match(/class="([^"]*)"/)?.[1]
				?.split(/\s+/);
			expect(classes, id).toContain("relative");
		}
	});

	it("gives a firm agent no waves: a dash, and why", async () => {
		const html = await page();
		const canon = element(html, "catalog-agents-table-row-canon");
		expect(cellsOf(canon)[3]).toBe(`${FIRM_WAVES.text}, ${FIRM_WAVES.title}`);
		expect(tagOf(canon, "catalog-agent-waves-canon")).toContain(
			`title="${FIRM_WAVES.title}"`,
		);
		// Everyone else keeps their waves.
		expect(cellsOf(element(html, "catalog-agents-table-row-atlas"))[3]).toBe(
			"B",
		);
		expect(isFirmAgent(agent("canon"))).toBe(true);
		expect(AGENTS.filter(isFirmAgent).map((a) => a.slug)).toEqual(["canon"]);
	});

	it("lists one row per live template, in wave order, with these columns", async () => {
		const html = await page();
		const table = element(html, "catalog-agents-table");
		const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
			(m[1] ?? "").replace(/<[^>]+>/g, ""),
		);
		// Sample headers carry their reason for screen readers; strip it here.
		expect(
			headers.map((h) => h.replace(/, Sample data until[^.]*\./g, "")),
		).toEqual([
			"AGENT TERRITORY",
			"SIDE",
			"ROLES",
			"WAVES",
			"VER SHA",
			"EST/CEIL",
		]);
		const order = [
			...table.matchAll(/data-testid="catalog-agents-table-row-([a-z]+)"/g),
		].map((m) => m[1]);
		expect(order).toEqual(
			sortAgents(AGENTS, { column: "wave", direction: "asc" }).map(
				(a) => a.slug,
			),
		);
	});

	it("shows a tile, the name over its territory, role chips, and mono machine values", async () => {
		const html = await page();
		const atlas = agent("atlas");
		const row = element(html, "catalog-agents-table-row-atlas");
		const d = sampleDispatch(atlas);
		const sha = sampleHistory(atlas).versions[0]?.sha256 ?? "";
		expect(cellsOf(row)).toEqual([
			`ATAtlas${territoriesOf(atlas).join(", ")}`,
			"author",
			"domainapi-surface",
			"B",
			`v${atlas.version}${sha.slice(0, 8)}`,
			`${Math.round(d.estimate / 1000)}k/${Math.round(d.hardCeiling / 1000)}k`,
		]);
		const tile = tagOf(row, "catalog-agent-tile-atlas");
		expect(tile).toContain('aria-hidden="true"');
		expect(tile).toContain('data-side="author"');
		expect(row.match(/data-testid="catalog-role"/g)).toHaveLength(2);
		expect(tagOf(row, "catalog-agent-sha-atlas")).toContain(`title="${sha}"`);
		// A horizontal agent's territory is the whole project.
		expect(element(html, "catalog-agent-territory-nemi")).toContain(
			">whole project<",
		);
		const tds = [...row.matchAll(/<td[^>]*class="([^"]*)"/g)].map((m) => m[1]);
		for (const i of [1, 3, 4, 5]) expect(tds[i]).toMatch(/\btype-mono\b/);
	});

	it("gives each side its own tile tone, from tokens only", async () => {
		const html = await page();
		const tone = (slug: string) =>
			tagOf(html, `catalog-agent-tile-${slug}`).match(/class="([^"]*)"/)?.[1] ??
			"";
		const tones = new Set(
			["atlas", "iyo", "brennan", "canon"].map((s) =>
				tone(s)
					.replace(
						/\b(inline-flex|shrink-0|items-center|justify-center|rounded-sm|font-medium|size-8|type-caption)\b/g,
						"",
					)
					.trim(),
			),
		);
		expect(tones.size).toBe(4);
		for (const t of tones) expect(t).not.toMatch(/#|rgb|oklch|-\d{3}\b/);
		expect(initialsOf("Atlas")).toBe("AT");
	});

	it("opens a row by pointer or keyboard, and sorts by side, wave and name only", async () => {
		const html = await page();
		expect(tagOf(html, "catalog-agents-table-row-atlas")).toContain(
			'tabindex="0"',
		);
		const sortable = [
			...element(html, "catalog-agents-table").matchAll(
				/<th[^>]*data-column="([a-z]+)"[^>]*aria-sort=/g,
			),
		].map((m) => m[1]);
		expect(sortable.sort()).toEqual(["name", "side", "wave"]);
	});

	it("tabs by side with counts, then search and a wave and kind filter", async () => {
		const html = await page();
		expect(SIDE_TABS.map((t) => t.label)).toEqual([
			"All",
			"Authors",
			"Testers",
			"Judges",
			"Fixture",
			"Firm",
		]);
		const count = (id: string) =>
			element(html, `catalog-agents-side-${id}-count`).replace(/<[^>]+>/g, "");
		expect(count("all")).toBe(String(AGENTS.length));
		expect(count("author")).toBe("3");
		expect(count("tester")).toBe("2");
		expect(count("judge")).toBe("2");
		expect(count("fixture")).toBe("0");
		expect(count("firm")).toBe("1");
		expect(tagOf(html, "catalog-agents-side-all")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "catalog-agents-search")).toMatch(
			/^<input[^>]*type="search"/,
		);
		expect(tagOf(html, "catalog-agents-filter")).toContain(
			'aria-label="Filter by wave and kind"',
		);
	});

	it("says how many it shows, with no pages when they all fit", async () => {
		const html = await page();
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agents-showing"[^>]*>Showing ${AGENTS.length} of ${AGENTS.length}<`,
			),
		);
		expect(html).not.toContain('aria-label="Pages"');
	});

	it("counts from meta.total in the top bar, and offers the next page", async () => {
		expect(element(await page(), "topbar-subtitle")).toContain(
			`>${AGENTS.length} agent templates<`,
		);
		const html = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: { rows: AGENTS, total: 40, nextCursor: "c2" } }),
		);
		expect(element(html, "topbar-subtitle")).toContain(">40 agent templates<");
		// One count on the page, the table's, against the server's total.
		expect(element(html, "catalog-agents-showing")).toContain(
			`>Showing ${AGENTS.length} of 40<`,
		);
		expect(html.match(/>Showing \d+ of \d+</g)).toHaveLength(1);
		expect(html).toContain(
			'data-testid="catalog-agents-list-footer-load-more"',
		);
		const one = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: [agent("atlas")] }),
		);
		expect(element(one, "topbar-subtitle")).toContain(">1 agent template<");
	});

	it("puts no middle dot in any meta string (ruling 4)", async () => {
		const html = await page();
		const body = element(html, "catalog-agents");
		expect(body).not.toContain("·");
	});

	it("opens an agent on its own page, never in a panel over the list", async () => {
		const html = await page();
		expect(html).not.toContain("catalog-agent-panel");
		const source = readFileSync(
			"src/components/avel/catalog-agents.tsx",
			"utf8",
		);
		expect(source).toContain('to: "/catalog/agents/$slug"');
		expect(source).not.toMatch(/Sheet|search: \(prev\)/);
	});
});

describe("an agent page's tabs", () => {
	const atlas = agent("atlas");
	const history = sampleHistory(atlas);
	const body = (a = atlas) =>
		tip(
			<OverviewTab
				agent={a}
				agents={AGENTS}
				history={sampleHistory(a)}
				onOpen={noop}
			/>,
		);

	it("never offers an edit: no field, form or Edit anywhere in it", () => {
		for (const html of [
			body(),
			tip(<IdentityTab agent={atlas} history={history} />),
			tip(<ManifestTab agent={atlas} />),
			tip(<VersionsTab history={history} />),
		]) {
			expect(html).not.toMatch(/<(textarea|input|form)\b/);
			expect(html).not.toMatch(/>Edit</);
		}
	});

	it("overview: four measures, each against the previous version", () => {
		const later = AGENTS.find((a) => a.version > 1);
		const first = AGENTS.find((a) => a.version === 1);
		expect(later && first).toBeTruthy();
		if (!later || !first) return;
		const html = body(later);
		const { current, previous } = sampleOverview(later);
		expect(previous).not.toBeNull();
		for (const id of ["gate", "tokens", "violations", "blockers"]) {
			const change = element(html, `catalog-agent-metric-${id}-change`).replace(
				/<[^>]+>/g,
				"",
			);
			expect(change).toMatch(
				/^(no change|[+-]\d+( pts|k)? since last version)$/,
			);
		}
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agent-metric-violations"[\\s\\S]*?>${current.boundaryViolations}<`,
			),
		);
		expect(tagOf(html, "catalog-agent-metrics")).toContain(
			`data-sample-region="${CATALOG_MISSING.measures}"`,
		);
		// A first version has nothing to compare with.
		expect(
			element(body(first), "catalog-agent-metric-gate-change").replace(
				/<[^>]+>/g,
				"",
			),
		).toBe("first version");
	});

	it("overview: the status box says what the rule says", () => {
		for (const a of AGENTS) {
			const html = body(a);
			const { ok } = agentStatus(sampleOverview(a).current);
			expect(tagOf(html, "catalog-agent-status"), a.slug).toContain(
				`data-ok="${ok}"`,
			);
			expect(html).toContain(ok ? "Everything looks good" : "Needs a look");
		}
	});

	it("overview: edges as rows that open the agent at the other end", () => {
		const opened: string[] = [];
		const html = tip(
			<OverviewTab
				agent={atlas}
				agents={AGENTS}
				history={history}
				onOpen={(slug) => opened.push(slug)}
			/>,
		);
		const { incoming, outgoing } = edgesOf(atlas, AGENTS);
		expect(incoming.length + outgoing.length).toBeGreaterThan(0);
		for (const e of incoming) {
			const row = element(html, `catalog-agent-edge-row-${e.from}-${e.to}`);
			expect(row).toMatch(/^<button/);
			for (const a of e.artifacts) expect(row).toContain(artifactLabel(a));
			expect(row).toContain(agent(e.from).name);
		}
		for (const e of outgoing) {
			expect(
				element(html, `catalog-agent-edge-row-${e.from}-${e.to}`),
			).toContain(agent(e.to).name);
		}
		expect(tagOf(html, "catalog-agent-edges")).toContain(
			`data-sample-region="${AGENT_MISSING.edges}"`,
		);
	});

	it("overview: measures kept apart, reconstructed runs set aside", () => {
		const withRuns = AGENTS.find(
			(a) => sampleHistory(a).reconstructed.length > 0,
		);
		expect(withRuns).toBeDefined();
		if (!withRuns) return;
		const html = body(withRuns);
		expect(element(html, "catalog-agent-discipline")).not.toContain(
			"catalog-outcome-table",
		);
		const client = element(html, "catalog-outcome-table-client");
		const internal = element(html, "catalog-outcome-table-internal");
		expect(client).toMatch(new RegExp(`-row-${withRuns.slug}:client:`));
		expect(client).not.toMatch(new RegExp(`-row-${withRuns.slug}:internal:`));
		expect(internal).not.toMatch(new RegExp(`-row-${withRuns.slug}:client:`));
		expect(element(html, "catalog-agent-reconstructed")).toContain(
			">Reconstructed<",
		);
		expect(element(html, "catalog-agent-discipline")).not.toContain(
			"mission-002",
		);
		expect(element(html, "catalog-agent-outcome")).not.toContain("mission-002");
	});

	it("identity: the live text, numbered, with only its token count a sample", () => {
		const html = tip(<IdentityTab agent={atlas} history={history} />);
		const lines = atlas.identityMd.split("\n").length;
		expect(
			element(html, "catalog-agent-identity-code-gutter").match(
				/<div>\d+<\/div>/g,
			),
		).toHaveLength(lines);
		expect(element(html, "catalog-agent-identity-code")).toContain(
			`>${atlas.identityMd.replaceAll("\n", "\n")}</pre>`,
		);
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agent-identity-tokens"[^>]*>${history.identityTokens} / 800 tokens<`,
			),
		);
		expect(tagOf(html, "catalog-agent-identity-size")).toContain(
			`data-sample-region="${CATALOG_MISSING.versions}"`,
		);
		expectLabelled(html, ["catalog-agent-identity-code"]);
	});

	it("manifest: the template's live fields, each glob on its line, then sample allowed actions", () => {
		const html = tip(<ManifestTab agent={atlas} />);
		const text = element(html, "catalog-agent-manifest-text").replace(
			/<[^>]+>/g,
			"",
		);
		expect(text).toContain("kind:feature");
		expect(text).toContain("roles:[domain, api-surface]");
		expect(text).toContain("waveDefaults:[B]");
		expect(text).toContain("engagementId:# shared identity");
		const globs = [
			...html.matchAll(
				/data-testid="catalog-agent-writable-path"[^>]*>- ([^<]+)</g,
			),
		].map((m) => m[1]);
		expect(globs).toEqual(atlas.writablePaths);
		expect(
			html.match(/data-testid="catalog-agent-actions-table-row-[A-Za-z]+"/g),
		).toEqual(['data-testid="catalog-agent-actions-table-row-Build"']);
		expect(tip(<ManifestTab agent={agent("canon")} />)).toContain("-row-Firm");
		expectLabelled(html, ["catalog-agent-manifest-text"]);
		expect(tagOf(html, "catalog-agent-actions")).toContain(
			`data-sample-region="${CATALOG_MISSING.families}"`,
		);
	});

	it("versions: a log, eight characters of hash, full on hover, Copy", () => {
		const html = tip(<VersionsTab history={history} />);
		expect(html.match(/data-testid="catalog-agent-version"/g)).toHaveLength(
			atlas.version,
		);
		for (const v of history.versions) {
			const hash = element(html, `catalog-agent-version-hash-${v.version}`);
			expect(hash).toContain(`title="${v.sha256}"`);
			expect(hash).toContain(`>${v.sha256.slice(0, 8)}<`);
			expect(hash).toContain(
				`aria-label="Copy the hash of version ${v.version}"`,
			);
			expect(html).toContain(`>${v.createdAt.slice(0, 10)}<`);
		}
		expect(
			html.match(/data-testid="catalog-agent-version-current"/g),
		).toHaveLength(1);
	});

	it("labels every sample region in the tabs, and only those", () => {
		const html = body();
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([CATALOG_MISSING.measures, AGENT_MISSING.edges]),
		);
		const tabs = [
			tip(<IdentityTab agent={atlas} history={history} />),
			tip(<ManifestTab agent={atlas} />),
			tip(<VersionsTab history={history} />),
		].join("");
		expect(new Set(regions(tabs).map((r) => r.missing))).toEqual(
			new Set([CATALOG_MISSING.versions, CATALOG_MISSING.families]),
		);
	});
});

describe("/catalog/agents: the artifact graph", () => {
	const page = inProviders(
		<Console view="graph" />,
		seededClient({ agents: AGENTS }),
		"/catalog/agents",
	);
	// One agent's edges print their artifacts when it is the selected one.
	const html = tip(
		<AgentGraph agents={AGENTS} selected="atlas" onOpen={noop} />,
	);

	it("sits in a region whose pill names the artifact edge graph", () => {
		expectLabelled(page, ["catalog-agents-read-only"]);
		expect(tagOf(page, "catalog-agents-graph-region")).toContain(
			`data-sample-region="${AGENT_MISSING.edges}"`,
		);
		expect(page).not.toContain('data-testid="catalog-agents-table"');
		// On the list nothing is selected, so no node is marked.
		expect(page).not.toContain("data-selected");
	});

	it("draws every live agent as a focusable node that names itself", () => {
		for (const a of AGENTS) {
			const node = tagOf(html, `catalog-agent-node-${a.slug}`);
			expect(node).toMatch(/^<g/);
			expect(node).toContain('role="button"');
			expect(node).toContain('tabindex="0"');
			expect(node).toMatch(
				new RegExp(
					isFirmAgent(a)
						? `aria-label="${a.name}, firm, between missions\\.`
						: `aria-label="${a.name}, wave [A-E]\\.`,
				),
			);
		}
		expect(tagOf(html, "catalog-agent-node-atlas")).toContain(
			'data-selected="true"',
		);
		expect(tagOf(html, "catalog-agent-node-leon")).not.toContain(
			"data-selected",
		);
	});

	it("places nodes in wave columns, A to D, with E apart", () => {
		const x = (slug: string) =>
			Number(
				tagOf(html, `catalog-agent-node-${slug}`).match(
					/translate\(([\d.]+) /,
				)?.[1],
			);
		expect(x("atlas")).toBe(x("leon"));
		expect(x("leonora")).toBeLessThan(x("atlas"));
		expect(x("atlas")).toBeLessThan(x("iyo"));
		expect(x("iyo")).toBeLessThan(x("brennan"));
		expect(html).toMatch(
			/data-testid="catalog-agent-graph-wave-E"[^>]*>wave E, operate, set apart</,
		);
		// E sits further from D than any wave from the one before it.
		const waveX = (w: string) =>
			Number(
				tagOf(html, `catalog-agent-graph-wave-${w}`).match(
					/\sx="([\d.]+)"/,
				)?.[1],
			);
		const step = waveX("B") - waveX("A");
		expect(waveX("C") - waveX("B")).toBe(step);
		expect(waveX("D") - waveX("C")).toBe(step);
		expect(waveX("E") - waveX("D")).toBeGreaterThan(step);
	});

	it("sets firm agents apart, in a band below the waves, never in wave A", () => {
		const at = (slug: string) => {
			const m = tagOf(html, `catalog-agent-node-${slug}`).match(
				/translate\(([\d.]+) ([\d.]+)\)/,
			);
			return { x: Number(m?.[1]), y: Number(m?.[2]) };
		};
		const firm = at("canon");
		for (const a of AGENTS.filter((a) => !isFirmAgent(a))) {
			expect(firm.y, a.slug).toBeGreaterThan(at(a.slug).y);
		}
		expect(html).toMatch(
			/data-testid="catalog-agent-graph-lane-firm"[^>]*>firm, between missions</,
		);
		// Leonora is alone in wave A.
		expect(firm.y).not.toBe(at("leonora").y);
	});

	it("leaves room for wave E's label, so it is never cut off", () => {
		const svg = tagOf(html, "catalog-agent-graph");
		const width = Number(svg.match(/viewBox="0 0 ([\d.]+) /)?.[1]);
		const label = "wave E, operate, set apart";
		const x = Number(
			tagOf(html, "catalog-agent-graph-wave-E").match(/\sx="([\d.]+)"/)?.[1],
		);
		// type-mono-small is 13.5px; a mono character is about 0.6em wide.
		expect(x + label.length * 13.5 * 0.6).toBeLessThanOrEqual(width);
	});

	it("fits its column: it scales down to 80%, then scrolls", () => {
		const svg = tagOf(html, "catalog-agent-graph");
		const width = Number(svg.match(/viewBox="0 0 ([\d.]+) /)?.[1]);
		expect(svg).toMatch(/style="[^"]*width:100%/);
		expect(svg).toContain(`min-width:${Math.round(width * 0.8)}px`);
		expect(svg).toContain(`max-width:${width}px`);
		// No fixed width attribute holding it at full size.
		expect(svg).not.toMatch(/\swidth="\d/);
	});

	it("draws each edge with an arrow, naming artifact@hash on hover, printed for the selected agent", () => {
		const edges = sampleEdges(AGENTS);
		const touching = (e: (typeof edges)[number]) =>
			e.from === "atlas" || e.to === "atlas";
		expect(edges.some(touching)).toBe(true);
		expect(edges.some((e) => !touching(e))).toBe(true);
		for (const edge of edges) {
			const g = element(html, `catalog-agent-edge-${edge.from}-${edge.to}`);
			const labels = edge.artifacts.map(artifactLabel);
			expect(g).toMatch(/marker-end="url\(#catalog-agent-graph-arrow\)"/);
			expect(g).toContain(`<title>${labels.join(", ")}</title>`);
			const printed = [
				...g.matchAll(/data-testid="catalog-agent-edge-label"[^>]*>([^<]+)</g),
			].map((m) => m[1]);
			// Only the selected agent's edges print their labels, so they never pile up.
			expect(printed, `${edge.from}->${edge.to}`).toEqual(
				touching(edge) ? labels : [],
			);
		}
	});

	it("colours the SVG with tokens only, and puts no middle dot in it", () => {
		const svg = element(html, "catalog-agent-graph");
		expect(svg).not.toMatch(/rgb\(|oklch\(|fill="#|stroke="#/i);
		expect(svg).toMatch(/\bfill-app-panel\b/);
		expect(svg).toMatch(/\bstroke-border-strong\b/);
		expect(svg).not.toContain("·");
	});
});

describe("the code view", () => {
	const text = "---\nname: x\n---\n# Title\nbody";

	it("numbers every line in a gutter screen readers skip and copy leaves out", () => {
		const html = renderToString(
			<CodeView text={text} label="x.md" data-testid="cv" />,
		);
		expect(element(html, "cv-gutter").match(/<div>\d+<\/div>/g)).toHaveLength(
			5,
		);
		const gutter = tagOf(html, "cv-gutter");
		expect(gutter).toContain('aria-hidden="true"');
		expect(gutter).toContain("select-none");
		expect(tagOf(html, "cv")).toContain('aria-label="x.md"');
		expect(html).toContain(`>${text}</pre>`);
	});

	it("tones lines when asked, keeping the same text", () => {
		const html = renderToString(
			<CodeView
				text={text}
				label="x.md"
				data-testid="cv"
				lineTone={(line) =>
					line.startsWith("#")
						? "heading"
						: line === "---" || line.includes(":")
							? "key"
							: undefined
				}
			/>,
		);
		const pre = element(html, "cv-text");
		expect(pre.replace(/<[^>]+>/g, "")).toBe(text);
		expect(pre.match(/data-tone="key"/g)).toHaveLength(3);
		expect(pre).toMatch(
			/data-tone="heading" class="font-medium text-foreground">#/,
		);
	});
});

describe("every state of the live template list", () => {
	it("loads the real list: a skeleton, no pill, no not-built state, the definition as subtitle", async () => {
		const html = await renderPage("/catalog/agents");
		expect(tagOf(html, "catalog-agents-surface")).toContain(
			'data-state="loading"',
		);
		expect(html).toContain('data-testid="catalog-agents-skeleton"');
		expect(html).not.toContain('data-state="not-built"');
		expect(html).not.toContain('data-testid="sample-data"');
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain('data-testid="topbar-subtitle"');
		// Counts only with data: never a zero it cannot vouch for.
		expect(html).not.toContain("catalog-agents-side-all-count");
	});

	it("says when there are none, in words that state no build status", async () => {
		const html = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: [] }),
		);
		expect(tagOf(html, "catalog-agents-surface")).toContain(
			'data-state="empty"',
		);
		expect(html).toContain('data-testid="catalog-agents-empty"');
		expect(
			html.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
		).not.toMatch(/contract|avel-server|not built|yet\b|route/i);
		expect(element(html, "topbar-subtitle")).toContain(">0 agent templates<");
		expect(html).not.toContain("catalog-agents-side-all-count");
		expect(html).not.toContain('data-testid="sample-data"');
	});

	it("shows the error state when the list fails, with the request reference", async () => {
		const html = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: internalError(PATH) }),
		);
		expect(tagOf(html, "catalog-agents-surface")).toContain(
			'data-state="error"',
		);
		expect(html).toContain('data-testid="surface-error"');
		expect(html).toContain(">req_catalog<");
		expect(html).not.toContain("catalog-agents-side-all-count");
		expect(html).not.toContain('data-testid="sample-data"');
		expect(html).toContain('data-testid="catalog-agents-read-only"');
	});
});
