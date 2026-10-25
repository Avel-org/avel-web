import { readFileSync } from "node:fs";
import {
	createMemoryHistory,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import {
	type AgentTemplate,
	IDENTITY_TOKEN_CAP,
	type IdentityVersion,
	KIND_LABELS,
	ROLE_LABELS,
	ROLE_SIDE,
	ROLES,
	SIDE_LABELS,
	WAVES,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialsOf } from "@/components/avel/actor";
import { avatarCells } from "@/components/avel/agent-avatar";
import {
	AgentCard,
	agentDescription,
	CARD_PATHS,
	CARD_ROLES,
	CARD_SECTIONS,
	DESCRIPTION_MAX,
	FIRM_WAVES,
	rolesSentence,
} from "@/components/avel/catalog-agent-card";
import {
	AgentGraph,
	AgentGraphCanvas,
} from "@/components/avel/catalog-agent-graph";
import {
	AgentHandoffs,
	IdentityTab,
	IdentityText,
	ManifestTab,
	staleLine,
} from "@/components/avel/catalog-agent-inspector";
import {
	AGENT_MISSING,
	artifactLabel,
	artifactsOf,
	edgesOf,
	isFirmAgent,
	ROLE_ARTIFACTS,
	sampleDispatch,
	sampleEdges,
	sideOf,
} from "@/components/avel/catalog-agent-placeholders";
import {
	filterAgents,
	SIDE_TABS,
	sortAgents,
} from "@/components/avel/catalog-agent-table";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import { CATALOG_MISSING } from "@/components/avel/catalog-placeholders";
import {
	inCatalogOrder,
	RoleTag,
	teamOf,
} from "@/components/avel/catalog-sample";
import { CodeView } from "@/components/avel/code-view";
import { writablePathText } from "@/components/avel/writable-path";
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
 * QueryClient. The graph's edges and each card's territory and side are
 * still labelled samples (AVEL-DESIGN.md rulings 32 and 34), derived from the live
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
 * it) also names a known route; no pill sits outside a region, except the
 * one on a card's roles sentence, which labels that sentence alone (audit
 * F8, checked where it sits); and each real element named sits outside
 * every region.
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
		if (pill.missing === AGENT_MISSING.artifacts) continue;
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
function Console({ view }: { view: "cards" | "graph" }) {
	const query = useAgentTemplates();
	return <CatalogAgents query={query} view={view} onViewChange={noop} />;
}

// ---------------------------------------------------------------------------

/** One generated identity version for `a`: the server's shape, built here. */
function versionOf(
	a: AgentTemplate,
	identityMd: string,
	depthMd = "## Depth\n\nMore on how it works.\n",
): IdentityVersion {
	return {
		ref: `${a.slug}@v3`,
		number: 3,
		sha256: "ab".repeat(32),
		identityTokens: 412,
		depthTokens: 120,
		generatedBy: null,
		createdAt: "2026-10-13T12:00:00.000Z",
		agentTemplateId: a.id,
		identityMd,
		depthMd,
		inputs: {
			generatorVersion: "1",
			slug: a.slug,
			name: a.name,
			kind: a.kind,
			roles: a.roles,
			writablePaths: a.writablePaths,
			definitionsSha256: "cd".repeat(32),
			skills: [],
		},
	};
}

describe("the agent samples", () => {
	it("place every role on at most one side, from its family", () => {
		for (const a of AGENTS) {
			const sides = new Set(
				a.roles.map((role) => ROLE_SIDE[role]).filter(Boolean),
			);
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
});

describe("filtering and sorting", () => {
	it("filters by side tab, kind, wave and search, together", () => {
		const slugs = (f: Parameters<typeof filterAgents>[1]) =>
			filterAgents(AGENTS, f)
				.map((a) => a.slug)
				.sort();
		expect(slugs({ side: "judge" })).toEqual(["brennan", "zane"]);
		expect(slugs({ side: "none" })).toEqual(["canon"]);
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

describe("/catalog/agents: the cards", () => {
	it("renders the same page for the same data on every visit", async () => {
		const once = () =>
			renderSeeded("/catalog/agents", seededClient({ agents: AGENTS }));
		expect(await once()).toBe(await once());
	});

	it("replaces the table: no table, no pages, Cards | Graph with Cards pressed", async () => {
		const html = await page();
		expect(html).not.toContain("catalog-agents-table");
		expect(html).not.toMatch(/<table[\s>]/);
		expect(html).not.toContain('aria-label="Pages"');
		const toggle = element(html, "catalog-agents-view");
		expect(
			[...toggle.matchAll(/data-testid="catalog-agents-view-([a-z]+)"/g)].map(
				(m) => m[1],
			),
		).toEqual(["cards", "graph"]);
		expect(tagOf(html, "catalog-agents-view-cards")).toContain(
			'aria-pressed="true"',
		);
		expect(html).not.toContain("catalog-agents-graph-region");
	});

	it("keeps the view in the URL: ?view=graph is the graph", async () => {
		const html = await page("?view=graph");
		expect(tagOf(html, "catalog-agents-view-graph")).toContain(
			'aria-pressed="true"',
		);
		expect(html).toContain('data-testid="catalog-agents-graph-region"');
		expect(html).not.toContain('data-testid="catalog-agents-cards"');
	});

	it("lists one card per live agent, in wave order, each built from its sections", async () => {
		const html = await page();
		const grid = element(html, "catalog-agents-cards");
		const order = [
			...grid.matchAll(/data-testid="catalog-agent-card-([a-z]+)"/g),
		].map((m) => m[1]);
		expect(order).toEqual(
			sortAgents(AGENTS, { column: "wave", direction: "asc" }).map(
				(a) => a.slug,
			),
		);
		for (const a of AGENTS) {
			const card = element(html, `catalog-agent-card-${a.slug}`);
			expect(
				[...card.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]),
				a.slug,
			).toEqual([...CARD_SECTIONS]);
			// Every card spans one grid row per section and takes them as a
			// subgrid, card and plate both, so sections line up across a row.
			for (const tag of [
				tagOf(html, `catalog-agent-card-${a.slug}`),
				card.slice(
					card.indexOf("<article"),
					card.indexOf(">", card.indexOf("<article")) + 1,
				),
			]) {
				expect(tag, a.slug).toMatch(/class="[^"]*\bgrid-rows-subgrid\b/);
				expect(tag, a.slug).toMatch(
					new RegExp(`class="[^"]*\\brow-span-${CARD_SECTIONS.length}\\b`),
				);
			}
			// No territory on the card: it is per mission.
			expect(card).not.toContain("catalog-agent-card-territory-");
			expect(card).not.toContain("data-sample-region");
		}
	});

	it("files each card under the team of its first wave, firm agents in Front office", async () => {
		const html = await page();
		const teamOfCard = (slug: string) =>
			[...html.matchAll(/data-testid="catalog-agents-team-([a-z]+)"/g)]
				.map((m) => ({ team: m[1], at: m.index ?? 0 }))
				.filter(
					(s) =>
						s.at < html.indexOf(`data-testid="catalog-agent-card-${slug}"`),
				)
				.at(-1)?.team;
		// Atlas's first role is a Setup role, but it works in wave B: Build.
		expect(agent("atlas").waveDefaults).toEqual(["B"]);
		expect(teamOfCard("atlas")).toBe("build");
		expect(teamOfCard("canon")).toBe("firm");
		expect(teamOf({ roles: ["schema"], waveDefaults: ["B", "A"] })).toBe(
			"foundation",
		);
		expect(teamOf({ roles: ["domain"], waveDefaults: [] })).toBe("firm");
		expect(teamOf({ roles: ["foundations"], waveDefaults: ["A"] })).toBe(
			"foundation",
		);
	});

	it("is a v3 option card: a hairline that strengthens on hover, and no lift", async () => {
		const html = await page();
		const card = element(html, "catalog-agent-card-atlas");
		const article = card.match(/<article[^>]*>/)?.[0] ?? "";
		const classes = (article.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
		for (const c of [
			"rounded-card",
			"border-border",
			"bg-app-panel",
			"shadow-card",
			"hover:border-border-strong",
			"hover:bg-app-raised",
		]) {
			expect(classes).toContain(c);
		}
		expect(article).not.toMatch(/translate|plate/);
	});

	it("labels the roles sentence as sample data, since what roles write is a sample (F8)", async () => {
		const html = await page();
		for (const a of AGENTS) {
			const section = element(html, `catalog-agent-card-description-${a.slug}`);
			expect(section.includes('data-testid="sample-data"'), a.slug).toBe(
				a.description === null,
			);
		}
	});

	it("heads each card with its identity: avatar, name, kind and identity ref", async () => {
		const html = await page();
		const atlas = element(html, "catalog-agent-card-identity-atlas");
		// The avatar is a picture drawn from the slug: decorative, the same
		// every time, and different from another agent's.
		const tile = element(atlas, "catalog-agent-tile-atlas");
		expect(tagOf(atlas, "catalog-agent-tile-atlas")).toContain(
			'aria-hidden="true"',
		);
		expect(tile).toContain("<rect");
		expect(avatarCells("atlas")).toEqual(avatarCells("atlas"));
		expect(avatarCells("atlas")).not.toEqual(avatarCells("nemi"));
		for (const row of avatarCells("atlas"))
			expect(row).toEqual([...row].reverse());
		expect(atlas).toMatch(/<h3[^>]*>Atlas<\/h3>/);
		// No identity in the fixtures yet: the slug, and not generated.
		const ref = element(atlas, "catalog-agent-ref-atlas");
		expect(ref).toContain(">atlas<");
		// The state rides on the chip: dashed, said on hover and to readers.
		expect(ref).toContain('data-generated="false"');
		expect(ref).toContain('title="Identity not generated"');
		expect(ref).toContain(">, not generated<");
		// The template's own version (an edit counter) is never on the card.
		expect(atlas).not.toContain(`>v${agent("atlas").version}<`);
		// Kind reads as how the agent is used.
		expect(element(html, "catalog-agent-kind-atlas")).toContain(
			`>${KIND_LABELS.feature}<`,
		);
		expect(element(html, "catalog-agent-kind-nemi")).toContain(
			`>${KIND_LABELS.horizontal}<`,
		);
		// Version hash and the token estimate are gone from this page.
		const body = element(html, "catalog-agents");
		expect(body).not.toContain("catalog-agent-sha-");
		expect(body).not.toMatch(/estimate|ceiling|\d[\d,.k]* tokens/i);
	});

	it("describes the agent first, in its own written words", async () => {
		const html = await page();
		const written = AGENTS.filter((a) => a.description !== null);
		// Both card paths are in the fixtures: written, and not written.
		expect(written.length).toBeGreaterThan(0);
		expect(written.length).toBeLessThan(AGENTS.length);
		for (const a of written) {
			expect(agentDescription(a)).toEqual({
				text: a.description,
				source: "written",
			});
			const section = element(html, `catalog-agent-card-description-${a.slug}`);
			expect(section).toContain('data-source="written"');
			const p = tagOf(section, `catalog-agent-description-${a.slug}`);
			// Two lines on the compact card, the whole text on hover.
			expect(p).toMatch(/class="[^"]*\bline-clamp-2\b/);
			expect(p).toMatch(/class="[^"]*\btype-small\b/);
			expect(p).toContain(`title="${a.description}"`);
			// The server's own words carry no caption.
			expect(section).not.toContain("catalog-agent-description-source-");
		}
		// First, right under the band.
		const card = element(html, "catalog-agent-card-atlas");
		expect(
			[...card.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1])[1],
		).toBe("description");
		// Written text is shown as plain words; long text is cut at a word.
		const both = { ...agent("atlas"), description: "Builds the **server**." };
		expect(agentDescription(both)).toEqual({
			text: "Builds the server.",
			source: "written",
		});
		const long = agentDescription({
			...agent("atlas"),
			description: "word ".repeat(80).trim(),
		}).text;
		expect(long.length).toBeLessThanOrEqual(DESCRIPTION_MAX + 1);
		expect(long).toMatch(/word…$/);
	});

	it("says what its roles do when nothing is written, and says so", async () => {
		expect(rolesSentence(agent("atlas"))).toBe(
			"On the Build team. Writes services and routes from contract.ts and migrations. Works in wave B.",
		);
		expect(rolesSentence(agent("canon"))).toBe(
			"On the Front office team. Writes brief and scope from client-input and engagement-history. Works between missions.",
		);
		// Three inputs at most are named; the rest are counted.
		expect(rolesSentence(agent("brennan"))).toBe(
			"On the Review team. Writes findings/spec from brief, services, routes and 2 more. Works in wave D.",
		);
		// An agent with nothing written says what its roles do.
		const html = await page();
		const unwritten = AGENTS.filter((a) => a.description === null);
		expect(unwritten.map((a) => a.slug)).toEqual(["nemi", "canon"]);
		for (const a of unwritten) {
			expect(agentDescription(a)).toEqual({
				text: rolesSentence(a),
				source: "roles",
			});
			const section = element(html, `catalog-agent-card-description-${a.slug}`);
			expect(section).toContain('data-source="roles"');
			expect(section).toContain(`>${rolesSentence(a)}<`);
			const caption = element(
				section,
				`catalog-agent-description-source-${a.slug}`,
			);
			expect(caption).toContain(">From its roles<");
			expect(caption).toMatch(/class="[^"]*\btype-caption\b/);
			// The sentence is drawn from sample role data, so it says so, and
			// the pill sits above the card's stretched link so its tooltip opens.
			const pill = tagOf(section, "sample-data");
			expect(pill).toMatch(/class="[^"]*\brelative\b[^"]*\bz-10\b/);
		}
	});

	it("shows role chips in catalog order, and where it works as five waves", async () => {
		const html = await page();
		const roles = element(html, "catalog-agent-roles-atlas");
		expect(
			[...roles.matchAll(/data-role="([^"]+)"/g)].map((m) => m[1]),
		).toEqual(["domain", "api-surface"]);
		const waves = element(html, "catalog-agent-waves-atlas");
		expect(
			[...waves.matchAll(/data-wave="([A-E])" data-runs="(true|false)"/g)].map(
				(m) => `${m[1]}${m[2] === "true" ? "+" : "-"}`,
			),
		).toEqual(["A-", "B+", "C-", "D-", "E-"]);
		expect(waves).toContain("Runs in waves B.");
		// The ones it skips are dashed.
		expect(waves).toMatch(/data-wave="A"[^>]*class="[^"]*\bborder-dashed\b/);
		expect(waves).not.toMatch(
			/data-wave="B"[^>]*class="[^"]*\bborder-dashed\b/,
		);
	});

	it("names each role in plain words first, never by its raw slug", async () => {
		const html = await page();
		for (const a of AGENTS) {
			const chips = element(html, `catalog-agent-roles-${a.slug}`);
			const labels = [
				...chips.matchAll(/data-testid="catalog-role-label"[^>]*>([^<]+)</g),
			].map((m) => m[1]);
			const shown = inCatalogOrder(a.roles).slice(0, CARD_ROLES);
			expect(labels, a.slug).toEqual(shown.map((role) => ROLE_LABELS[role]));
			for (const role of shown) expect(labels, role).not.toContain(role);
		}
		// A code role says so; a model role does not.
		const automated = tip(RoleTag({ role: "spec-check" }));
		expect(automated).toContain('data-testid="catalog-role-automated"');
		expect(automated).toContain(">Automated<");
		expect(tip(RoleTag({ role: "domain" }))).not.toContain("Automated");
	});

	it("gives a firm agent no waves: between missions, and why", async () => {
		const html = await page();
		const canon = element(html, "catalog-agent-waves-canon");
		expect(canon).not.toContain("data-wave=");
		expect(fromAttr(canon)).toContain(`title="${FIRM_WAVES.title}"`);
		expect(fromAttr(canon.replace(/<[^>]+>/g, ""))).toBe(
			`${FIRM_WAVES.text}. ${FIRM_WAVES.title}`,
		);
		expect(FIRM_WAVES.text).toBe("Between missions");
		expect(tagOf(html, "catalog-agent-waves-canon")).toMatch(
			/class="[^"]*\brelative\b/,
		);
		expect(isFirmAgent(agent("canon"))).toBe(true);
		expect(AGENTS.filter(isFirmAgent).map((a) => a.slug)).toEqual(["canon"]);
	});

	it("shows no other sample on a card: roles and waves are live, in one row, and no side", async () => {
		const html = await page();
		expectLabelled(html, [
			"catalog-agents-identity-note",
			"catalog-agents-view",
			"catalog-agent-card-identity-atlas",
			"catalog-agent-card-tags-atlas",
			"catalog-agent-card-footer-atlas",
			"catalog-agent-card-open-atlas",
		]);
		expect(regions(element(html, "catalog-agents-cards"))).toHaveLength(0);
		const tags = element(html, "catalog-agent-card-tags-atlas");
		expect(tags).toContain('data-testid="catalog-agent-roles-atlas"');
		expect(tags).toContain('data-testid="catalog-agent-waves-atlas"');
		// The side ("Writes code") left the card at the operator's request;
		// the agent's page still says it.
		expect(element(html, "catalog-agents-cards")).not.toContain(
			"catalog-agent-side-",
		);
		expect(tags).not.toContain(`>${SIDE_LABELS.author}<`);
	});

	it("names its first writable path in mono, counts the rest, and lists them all on hover", async () => {
		const html = await page();
		const leonora = element(html, "catalog-agent-paths-leonora");
		const globs = agent("leonora").writablePaths;
		expect(
			[
				...leonora.matchAll(
					/<span[^>]*type-mono[^>]*><span[^>]*data-testid="writable-path"[^>]*>([^<]+)</g,
				),
			].map((m) => m[1]),
		).toEqual(globs.slice(0, CARD_PATHS));
		expect(tagOf(html, "catalog-agent-paths-leonora")).toContain(
			`title="${globs.join("\n")}"`,
		);
		expect(element(html, "catalog-agent-paths-canon")).toContain(
			">Changes no files<",
		);
		const many = {
			...agent("zane"),
			writablePaths: ["a/**", "b/**", "c/**", "d/**", "e/**"],
		};
		const card = tip(
			<ul>
				<AgentCard agent={many} />
			</ul>,
		);
		const paths = element(card, "catalog-agent-paths-zane");
		expect(paths.match(/type-mono/g)).toHaveLength(CARD_PATHS);
		expect(paths).toMatch(/class="[^"]*\btruncate\b/);
		expect(element(card, "catalog-agent-paths-more-zane")).toContain(
			`>+${5 - CARD_PATHS} more<`,
		);
	});

	it("names a glob that matches every file Any file, the glob kept in its title", () => {
		expect(writablePathText("**")).toBe("Any file");
		expect(writablePathText("**/*")).toBe("Any file");
		expect(writablePathText("src/**")).toBe("src/**");
		const card = tip(
			<ul>
				<AgentCard
					agent={{ ...agent("zane"), writablePaths: ["**", "src/**"] }}
				/>
			</ul>,
		);
		const paths = element(card, "catalog-agent-paths-zane");
		const [any] = [
			...paths.matchAll(/<span[^>]*data-testid="writable-path"[^>]*>[^<]*</g),
		].map((m) => m[0]);
		expect(any).toContain('title="**"');
		expect(any).toContain('data-glob="**"');
		// Prose, so it leaves the path's mono.
		expect(any).toMatch(/class="[^"]*\bfont-sans\b[^"]*"[^>]*>Any file<$/);
		expect(paths).not.toMatch(/>\*\*</);
		// The rest is counted, and named whole on hover.
		expect(element(card, "catalog-agent-paths-more-zane")).toContain(
			">+1 more<",
		);
		expect(tagOf(card, "catalog-agent-paths-zane")).toContain(
			'title="**\nsrc/**"',
		);
	});

	it("is one link to the agent's page, stretched over the card", async () => {
		const html = await page();
		for (const a of AGENTS) {
			const card = element(html, `catalog-agent-card-${a.slug}`);
			const links = card.match(/<a[\s][^>]*>/g) ?? [];
			expect(links, a.slug).toHaveLength(1);
			const link = links[0] ?? "";
			expect(link).toContain(`href="/catalog/agents/${a.slug}"`);
			expect(link).toContain(`data-testid="catalog-agent-card-open-${a.slug}"`);
			expect(link).toContain(`aria-label="Open ${a.name}"`);
			expect(link).toMatch(/class="[^"]*after:absolute[^"]*after:inset-0/);
			expect(link.replace(/<[^>]+>/g, "")).toBe("");
			// A button inside a link is invalid: there is none.
			expect(card).not.toMatch(/<a[\s][^>]*>(?:(?!<\/a>)[\s\S])*<button/);
		}
	});

	it("draws one neutral tile for every side: the side is a fact, not a state", async () => {
		// Audit D3 and the meaning map: the accent is for what the operator can
		// act on and warn is for what needs them, so a side never takes either.
		// The side lives in the card's data-side and the side tabs.
		const html = await page();
		const tone = (slug: string) =>
			tagOf(html, `catalog-agent-tile-${slug}`).match(/class="([^"]*)"/)?.[1] ??
			"";
		const tones = new Set(["atlas", "iyo", "brennan", "canon"].map(tone));
		expect(tones.size).toBe(1);
		const [only = ""] = tones;
		expect(only).toContain("border-border");
		expect(only).not.toMatch(/accent|gate-|#|rgb|oklch|-\d{3}\b/);
		for (const slug of ["atlas", "iyo", "brennan", "canon"])
			expect(tagOf(html, `catalog-agent-card-${slug}`).length).toBeGreaterThan(
				0,
			);
		expect(html).toMatch(/data-side="author"/);
		expect(initialsOf("Atlas")).toBe("AT");
	});

	it("tabs by side with counts, then search and a wave and kind filter", async () => {
		const html = await page();
		expect(SIDE_TABS.map((t) => t.label)).toEqual([
			"All",
			"Writes code",
			"Writes tests",
			"Reviews",
			"Independent check",
			"Other",
		]);
		const count = (id: string) =>
			element(html, `catalog-agents-side-${id}-count`).replace(/<[^>]+>/g, "");
		expect(count("all")).toBe(String(AGENTS.length));
		expect(count("author")).toBe("3");
		expect(count("tester")).toBe("2");
		expect(count("judge")).toBe("2");
		expect(count("fixture")).toBe("0");
		expect(count("none")).toBe("1");
		expect(tagOf(html, "catalog-agents-side-all")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "catalog-agents-search-input")).toMatch(
			/^<input[^>]*type="search"/,
		);
		// Short enough to show whole in the field; the label says the rest.
		expect(tagOf(html, "catalog-agents-search-input")).toContain(
			'placeholder="Search agents"',
		);
		expect(html).toMatch(/<label[^>]*>Search agents by name or role<\/label>/);
		expect(tagOf(html, "catalog-agents-filter")).toContain(
			'aria-label="Filter by wave and kind"',
		);
		// The filter row sits above the cards.
		expect(html.indexOf('data-testid="catalog-agents-filters"')).toBeLessThan(
			html.indexOf('data-testid="catalog-agents-cards"'),
		);
	});

	it("says how many it shows, once", async () => {
		const html = await page();
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agents-showing"[^>]*>Showing ${AGENTS.length} of ${AGENTS.length}<`,
			),
		);
		expect(html.match(/>Showing \d+ of \d+</g)).toHaveLength(1);
	});

	it("counts from meta.total in the top bar, and offers the next page", async () => {
		expect(element(await page(), "topbar-subtitle")).toContain(
			`>${AGENTS.length} agents<`,
		);
		const html = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: { rows: AGENTS, total: 40, nextCursor: "c2" } }),
		);
		expect(element(html, "topbar-subtitle")).toContain(">40 agents<");
		// One count on the page, against the server's total.
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
		expect(element(one, "topbar-subtitle")).toContain(">1 agent<");
	});

	it("puts no middle dot in any meta string (ruling 4), and says agent and team", async () => {
		const html = await page();
		const body = element(html, "catalog-agents");
		expect(body).not.toContain("·");
		const text = body.replace(/<[^>]+>/g, " ");
		expect(text).not.toMatch(/template|preset|—/i);
	});

	it("opens an agent on its own page, never in a panel over the list", async () => {
		const html = await page();
		expect(html).not.toContain("catalog-agent-panel");
		const source = readFileSync(
			"src/components/avel/catalog-agents.tsx",
			"utf8",
		);
		expect(source).not.toMatch(/Sheet|search: \(prev\)/);
		// The graph's handoffs dock inline, so nothing slides over the list
		// there either; their link opens the agent's own page.
		const graph = readFileSync(
			"src/components/avel/catalog-agent-graph.tsx",
			"utf8",
		);
		expect(graph).not.toMatch(/Sheet/);
		expect(graph).toContain('to="/catalog/agents/$slug"');
	});
});

describe("an agent page's tabs", () => {
	const atlas = agent("atlas");
	const body = (a = atlas) =>
		tip(<AgentHandoffs agent={a} agents={AGENTS} onOpen={noop} />);

	it("never offers an edit: no field, form or Edit anywhere in it", () => {
		for (const html of [
			body(),
			tip(<IdentityTab agent={atlas} />),
			tip(
				<IdentityText
					agent={atlas}
					version={versionOf(atlas, "# Atlas\n\nIt builds.\n")}
				/>,
			),
			tip(<ManifestTab agent={atlas} />),
		]) {
			expect(html).not.toMatch(/<(textarea|input|form)\b/);
			expect(html).not.toMatch(/>Edit</);
		}
	});

	it("overview: edges as rows that open the agent at the other end", () => {
		const opened: string[] = [];
		const html = tip(
			<AgentHandoffs
				agent={atlas}
				agents={AGENTS}
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

	it("identity: the version's live text, numbered, with the server's counts, hash and ref", () => {
		const identityMd = "# Atlas\n\nAtlas builds the server side.\n";
		const version = versionOf(atlas, identityMd);
		const html = tip(<IdentityText agent={atlas} version={version} />);
		expect(
			element(html, "catalog-agent-identity-code-gutter").match(
				/<div>\d+<\/div>/g,
			),
		).toHaveLength(identityMd.split("\n").length);
		expect(element(html, "catalog-agent-identity-code")).toContain(
			`>${identityMd}</pre>`,
		);
		expect(element(html, "catalog-agent-depth-code")).toContain(">## Depth");
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agent-identity-tokens"[^>]*>identity.md: 412 / ${IDENTITY_TOKEN_CAP} tokens<`,
			),
		);
		expect(html).toMatch(
			new RegExp(
				`data-testid="catalog-agent-depth-tokens"[^>]*>depth.md: 120 / ${IDENTITY_TOKEN_CAP} tokens<`,
			),
		);
		expect(element(html, "catalog-agent-identity-ref")).toContain(">atlas@v3<");
		expect(tagOf(html, "catalog-agent-identity-sha")).toBeTruthy();
		expect(element(html, "catalog-agent-identity-sha")).toContain(
			`title="${version.sha256}"`,
		);
		// The counts are the server's: no sample region is left in the panel.
		expect(regions(html)).toHaveLength(0);
		expect(html).not.toContain("catalog-agent-identity-stale");
		expectLabelled(html, ["catalog-agent-identity-code"]);
	});

	it("identity: says when none has been generated, and asks for nothing", () => {
		expect(atlas.identityVersion).toBeNull();
		const html = tip(<IdentityTab agent={atlas} />);
		expect(element(html, "catalog-agent-identity-none")).toContain(
			"This agent&#x27;s identity hasn&#x27;t been generated yet. Generate identity, above, writes it from its roles.",
		);
		expect(html).not.toContain("catalog-agent-identity-skeleton");
	});

	it("identity: names the inputs that moved since the version in force", () => {
		const stale = {
			...atlas,
			identityVersion: 3,
			identityStale: true,
			staleInputs: ["roles", "skills"] as const,
		};
		const html = tip(
			<IdentityText
				agent={{ ...stale, staleInputs: [...stale.staleInputs] }}
				version={versionOf(atlas, "# Atlas\n\nIt builds.\n")}
			/>,
		);
		expect(element(html, "catalog-agent-identity-stale")).toContain(
			"Inputs changed since atlas@v3: its roles and its skills.",
		);
		expect(staleLine("x@v1", ["definitionsSha256"])).toBe(
			"Inputs changed since x@v1: the role definitions.",
		);
	});

	it("shows the identity ref on each card: atlas@v3, out of date once, or not generated", () => {
		const card = (a: typeof atlas) =>
			element(
				tip(
					<ul>
						<AgentCard agent={a} />
					</ul>,
				),
				`catalog-agent-ref-${a.slug}`,
			);
		const fresh = card({ ...atlas, identityVersion: 3 });
		expect(fresh).toContain(">atlas@v3<");
		expect(fresh).not.toContain("out of date");
		const stale = card({ ...atlas, identityVersion: 3, identityStale: true });
		expect(stale).toContain(">atlas@v3<");
		// The chip itself turns warn, and says why on hover and to readers.
		expect(stale).toContain("text-gate-warn");
		expect(stale).toContain('title="Identity atlas@v3, out of date"');
		expect(stale.match(/>, out of date</g)).toHaveLength(1);
		expect(card(atlas)).toContain(">, not generated<");
		// Said in one place: no second identity line on the card.
		const whole = tip(
			<ul>
				<AgentCard
					agent={{ ...atlas, identityVersion: 3, identityStale: true }}
				/>
			</ul>,
		);
		expect(whole.match(/>, out of date</g)).toHaveLength(1);
		expect(whole).not.toContain("catalog-agent-identity-cue-");
	});

	it("manifest: the fields the editors leave, live, then sample allowed actions", () => {
		const html = tip(<ManifestTab agent={atlas} />);
		const text = element(html, "catalog-agent-manifest-text").replace(
			/<[^>]+>/g,
			"",
		);
		expect(text).toContain("kind:feature");
		expect(text).toContain("waveDefaults:[B]");
		expect(text).toContain("engagementId:# used for every client");
		// Roles and paths have editors above the manifest: never shown twice.
		expect(text).not.toContain("roles:");
		expect(text).not.toContain("writablePaths:");
		expect(html).not.toContain("catalog-agent-writable-path");
		expect(
			html.match(/data-testid="catalog-agent-actions-table-row-[A-Za-z]+"/g),
		).toEqual(['data-testid="catalog-agent-actions-table-row-build"']);
		expect(tip(<ManifestTab agent={agent("canon")} />)).toContain("-row-firm");
		expectLabelled(html, ["catalog-agent-manifest-text"]);
		expect(tagOf(html, "catalog-agent-actions")).toContain(
			`data-sample-region="${CATALOG_MISSING.teams}"`,
		);
	});

	it("labels every sample region in the tabs, and only those", () => {
		const html = body();
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([AGENT_MISSING.edges]),
		);
		const tabs = [
			tip(<IdentityTab agent={atlas} />),
			tip(<ManifestTab agent={atlas} />),
		].join("");
		expect(new Set(regions(tabs).map((r) => r.missing))).toEqual(
			new Set([CATALOG_MISSING.teams]),
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
		expectLabelled(page, ["catalog-agents-identity-note"]);
		expect(tagOf(page, "catalog-agents-graph-region")).toContain(
			`data-sample-region="${AGENT_MISSING.edges}"`,
		);
		expect(page).not.toContain('data-testid="catalog-agents-cards"');
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
						? `aria-label="${a.name}, firm agent, between missions\\.`
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
			/data-testid="catalog-agent-graph-wave-E"[^>]*>wave E, after launch</,
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
			/data-testid="catalog-agent-graph-lane-firm"[^>]*>firm agents, between missions</,
		);
		// Leonora is alone in wave A.
		expect(firm.y).not.toBe(at("leonora").y);
	});

	it("leaves room for wave E's label, so it is never cut off", () => {
		const svg = tagOf(html, "catalog-agent-graph");
		const width = Number(svg.match(/viewBox="0 0 ([\d.]+) /)?.[1]);
		const label = "wave E, after launch";
		const x = Number(
			tagOf(html, "catalog-agent-graph-wave-E").match(/\sx="([\d.]+)"/)?.[1],
		);
		// type-mono is 13.5px; a mono character is about 0.6em wide.
		expect(x + label.length * 13.5 * 0.6).toBeLessThanOrEqual(width);
	});

	// 70%, not 80%: the drawing was tightened to 1010 wide (columns 180
	// apart, Operate's gap 32) so it fits the canvas at 1280 whole, and only
	// narrower windows shrink it further; 70% keeps the cards legible there.
	it("fits its column: it scales down to 70%, then scrolls", () => {
		const svg = tagOf(html, "catalog-agent-graph");
		const width = Number(svg.match(/viewBox="0 0 ([\d.]+) /)?.[1]);
		expect(svg).toMatch(/style="[^"]*width:100%/);
		expect(svg).toContain(`min-width:${Math.round(width * 0.7)}px`);
		// Wave E in view at 1280: the drawing fits a canvas that wide.
		expect(width).toBeLessThanOrEqual(1010);
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
		// Nodes are v3 cards in HTML within the drawing.
		expect(svg).toMatch(/\bbg-app-panel\b/);
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
		expect(element(html, "topbar-subtitle")).toContain(">0 agents<");
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
		expect(html).toContain('data-testid="catalog-agents-identity-note"');
	});
});

describe("the handoff graph on the canvas", () => {
	const canvas = (initialSelected?: string) =>
		tip(<AgentGraphCanvas agents={AGENTS} initialSelected={initialSelected} />);

	it("lays the graph on the builders' dot-grid band, with its hint", () => {
		const html = canvas();
		const band = tagOf(html, "catalog-agent-graph-canvas");
		for (const cls of ["bg-app-band", "rounded-dialog", "bg-size-[20px_20px]"])
			expect(band).toContain(cls);
		expect(html).toContain('data-testid="catalog-agent-graph-hint"');
		expect(html).not.toContain('data-testid="catalog-agent-graph-details"');
	});

	it("draws each node as a v3 card, the chosen one in the selected state", () => {
		const html = canvas("atlas");
		const cards = [
			...html.matchAll(/data-slot="graph-card"[^>]*class="([^"]*)"/g),
		].map((m) => m[1] ?? "");
		expect(cards).toHaveLength(AGENTS.length);
		expect(tagOf(html, "catalog-agent-node-atlas")).toContain(
			'aria-pressed="true"',
		);
		const atlas = element(html, "catalog-agent-node-atlas");
		expect(atlas).toContain("border-selected-border bg-selected");
		const leon = element(html, "catalog-agent-node-leon");
		expect(leon).toContain("rounded-card");
		expect(leon).toContain("shadow-card");
		expect(leon).not.toContain("bg-selected");
	});

	it("docks a chosen agent's handoffs inline, sample-labelled, with a close and a link to its page", () => {
		const html = canvas("atlas");
		const drawer = element(html, "catalog-agent-graph-details");
		expect(drawer).toMatch(/^<aside/);
		expect(tagOf(drawer, "catalog-agent-graph-close")).toContain(
			'aria-label="Close the handoffs"',
		);
		// Beside the graph at 2xl; above it narrower, so wave E stays in view.
		expect(tagOf(html, "catalog-agent-graph-details")).toContain("order-first");
		expect(drawer).toContain(">Atlas<");
		expect(tagOf(drawer, "catalog-agent-graph-open")).toContain(
			'href="/catalog/agents/atlas"',
		);
		expect(tagOf(drawer, "catalog-agent-graph-handoffs")).toContain(
			`data-sample-region="${AGENT_MISSING.edges}"`,
		);
		const edges = sampleEdges(AGENTS).filter(
			(e) => e.from === "atlas" || e.to === "atlas",
		);
		for (const e of edges)
			expect(drawer).toContain(e.artifacts.map(artifactLabel).join(", "));
	});
});
