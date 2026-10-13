import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type AgentTemplate,
	agentTemplateSchema,
	GATES,
	type MissionDetail,
	type MissionListItem,
	type MissionPlan,
	missionDetail,
	missionListItem,
	missionPlanSchema,
	type Playbook,
	type Preset,
	playbookSchema,
	presetSchema,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { missionKeys } from "@/components/avel/mission-data";
import { GATE_DOCS } from "@/components/avel/playbook-gate-docs";
import {
	fieldCheck,
	ofType,
	templatesByWave,
} from "@/components/avel/playbook-sections";
import { ApiOverrideProvider, queryKeys } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { presetCoherenceInput, verdictOf } from "@/lib/api/coherence";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ISO = "2026-10-01T00:00:00.000Z";

function template(
	n: number,
	extra: Partial<AgentTemplate> = {},
): AgentTemplate {
	return agentTemplateSchema.parse({
		id: uuid(100 + n),
		slug: `agent-${n}`,
		name: `Agent ${n}`,
		kind: "horizontal",
		description: null,
		roles: ["api-surface"],
		engagementId: null,
		waveDefaults: ["A"],
		identityMd: "",
		depthMd: "",
		writablePaths: [`src/agent-${n}/**`],
		version: 1,
		createdAt: ISO,
		updatedAt: ISO,
		...extra,
	});
}

const ATLAS = template(1, {
	name: "Atlas",
	roles: ["foundations"],
	waveDefaults: ["A"],
});
const NEMI = template(2, {
	name: "Nemi",
	roles: ["backend-tests"],
	waveDefaults: ["B", "C"],
});

const PLAYBOOK: Playbook = playbookSchema.parse({
	id: uuid(1),
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["A", "B", "D"],
	gates: [
		{ gate: "alignment", policy: "mandatory" },
		{ gate: "qa", policy: "warn" },
	],
	deliverable: "pr",
	requiredFields: ["brief", "repo_url", "conventions"],
	defaultPresetId: uuid(301),
	version: 2,
	createdAt: ISO,
	updatedAt: ISO,
});

function preset(
	agents: Preset["agents"],
	cut: Preset["cut"] = "horizontal",
): Preset {
	return presetSchema.parse({
		id: uuid(301),
		name: "Starter squad",
		description: null,
		cut,
		agents,
		version: 4,
		createdAt: ISO,
		updatedAt: ISO,
	});
}

const agent = (t: AgentTemplate, waves: Preset["agents"][number]["waves"]) => ({
	agentTemplateId: t.id,
	waves,
	territory: null,
	writablePaths: null,
	estimatedTokens: null,
});

const ITEM: MissionListItem = missionListItem.parse({
	id: uuid(501),
	origin: "internal",
	type: "template-booking",
	sprintN: 1,
	status: "draft",
	cut: "horizontal",
	cutSource: "derived",
	client: null,
	engagement: null,
	lastExport: null,
	lastActivityAt: null,
	needsYou: null,
	createdAt: ISO,
	updatedAt: ISO,
});

const DETAIL: MissionDetail = missionDetail.parse({
	...ITEM,
	brief: {},
	spendCeilingUsd: null,
	cutRationale: null,
	repoUrl: "https://github.com/example/app",
	roster: { agents: 1, active: 1 },
	playbook: { missionType: "template-booking", name: "Template booking" },
	recentActivity: [],
});

const plan = (brief: MissionPlan["brief"]): MissionPlan =>
	missionPlanSchema.parse({
		missionId: ITEM.id,
		brief,
		approvedBrief: null,
		templateRef: null,
		templateVersion: null,
		check: { passed: true, issues: [] },
	});

const BRIEF = {
	summary: "s",
	requirements: [],
	acceptanceCriteria: [],
	modules: [],
};

const ENTRY: RosterEntry = rosterEntrySchema.parse({
	id: uuid(601),
	missionId: ITEM.id,
	agentTemplate: {
		id: ATLAS.id,
		slug: ATLAS.slug,
		name: ATLAS.name,
		kind: ATLAS.kind,
		roles: ATLAS.roles,
	},
	active: true,
	waves: ["A"],
	customizedMd: null,
	writablePaths: null,
	territory: null,
	estimatedTokens: null,
	tokenSoftCeiling: null,
	tokenHardCeiling: null,
	grain: "default",
	absorbedBoundaries: [],
	accessOverrides: null,
	createdAt: ISO,
	updatedAt: ISO,
});

// ---------------------------------------------------------------------------
// Pure.

describe("the gate docs", () => {
	it("quote the docs for alignment only, and invent nothing for the rest", () => {
		expect(Object.keys(GATE_DOCS).sort()).toEqual([...GATES].sort());
		const defined = GATES.filter((g) => GATE_DOCS[g] !== null);
		expect(defined).toEqual(["alignment"]);
		expect(GATE_DOCS.alignment.source).toContain(
			"CLIENT-CONTRACT-CONFORMANCE.md",
		);
	});
});

describe("templatesByWave", () => {
	it("puts each template under every wave it declares, by name", () => {
		const byWave = templatesByWave([NEMI, ATLAS]);
		expect(byWave.A).toEqual(["Atlas"]);
		expect(byWave.B).toEqual(["Nemi"]);
		expect(byWave.C).toEqual(["Nemi"]);
		expect(byWave.E).toEqual([]);
	});
});

describe("fieldCheck", () => {
	it("checks brief against the plan, unknown until the plan is in", () => {
		expect(fieldCheck("brief", DETAIL, plan(BRIEF))).toBe("met");
		expect(fieldCheck("brief", DETAIL, plan(null))).toBe("missing");
		expect(fieldCheck("brief", DETAIL, undefined)).toBe("unknown");
	});

	it("checks the repository on the mission, and calls the rest unknown", () => {
		expect(fieldCheck("repo_url", DETAIL, undefined)).toBe("met");
		expect(fieldCheck("repo_url", { ...DETAIL, repoUrl: " " }, undefined)).toBe(
			"missing",
		);
		expect(fieldCheck("conventions", DETAIL, plan(BRIEF))).toBe("unknown");
	});
});

describe("ofType", () => {
	it("keeps exact type matches only, since the search is a substring", () => {
		const other = { ...ITEM, id: uuid(502), type: "template-booking-lite" };
		expect(ofType([ITEM, other], "template-booking").map((m) => m.id)).toEqual([
			ITEM.id,
		]);
	});
});

describe("presetCoherenceInput", () => {
	it("treats every agent as active, with its template's kind, roles and paths", () => {
		const input = presetCoherenceInput(
			preset([agent(ATLAS, ["A"])], "vertical"),
			new Map([[ATLAS.id, ATLAS]]),
		);
		expect(input).toEqual({
			cut: "vertical",
			roster: [
				{
					id: ATLAS.id,
					active: true,
					waves: ["A"],
					kind: "horizontal",
					roles: ["foundations"],
					writablePaths: ["src/agent-1/**"],
				},
			],
		});
	});

	it("onto a mission: after its entries, or in their place, under its cut", () => {
		const before = {
			cut: "vertical" as const,
			roster: [
				{
					id: uuid(9),
					active: true,
					waves: ["B" as const],
					kind: "feature" as const,
					roles: [],
					writablePaths: [],
				},
			],
		};
		const templates = new Map([[ATLAS.id, ATLAS]]);
		const p = preset([agent(ATLAS, ["A"])], "horizontal");
		const added = presetCoherenceInput(p, templates, {
			before,
			replace: false,
		});
		expect(added?.cut).toBe("vertical");
		expect(added?.roster.map((e) => e.id)).toEqual([uuid(9), ATLAS.id]);
		const replaced = presetCoherenceInput(p, templates, {
			before,
			replace: true,
		});
		expect(replaced?.roster.map((e) => e.id)).toEqual([ATLAS.id]);
	});

	it("is null while a template is not loaded", () => {
		expect(
			presetCoherenceInput(preset([agent(ATLAS, ["A"])]), new Map()),
		).toBeNull();
	});

	it("reads a result as blocked, warned or clear", () => {
		expect(verdictOf({ warnings: [] })).toBe("clear");
		expect(
			verdictOf({
				warnings: [
					{
						code: "vertical_cut_roles_unassigned",
						reason: "r",
						missing: ["foundations"],
					},
				],
			}),
		).toBe("warn");
		expect(
			verdictOf({
				block: { code: "no_agents_in_first_wave", reason: "r", wave: "A" },
				warnings: [],
			}),
		).toBe("block");
	});
});

// ---------------------------------------------------------------------------
// On the builder page.

type Seed = (client: QueryClient) => void;
const set =
	(key: readonly unknown[], value: unknown): Seed =>
	(client) =>
		client.setQueryData([...key], value);

const pages = <T,>(rows: T[]) => ({
	pages: [{ data: rows, meta: { nextCursor: null, total: rows.length } }],
	pageParams: [undefined],
});

const listParams = (origin: "client" | "internal") => ({
	q: "template-booking",
	sort: "lastActivity",
	includeArchived: false,
	origin,
});

function everything(p: Preset, missions: MissionListItem[] = [ITEM]): Seed[] {
	return [
		set(queryKeys.playbooks.byType("template-booking"), PLAYBOOK),
		set(queryKeys.presets.detail(PLAYBOOK.defaultPresetId), p),
		set(
			queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE),
			pages([ATLAS, NEMI]),
		),
		set(queryKeys.roster.template(ATLAS.id), ATLAS),
		set(queryKeys.roster.template(NEMI.id), NEMI),
		set(missionKeys.list(listParams("client") as never), pages([])),
		set(missionKeys.list(listParams("internal") as never), pages(missions)),
		set(missionKeys.detail(ITEM.id), DETAIL),
		set(queryKeys.missionPlans.detail(ITEM.id), plan(null)),
		set(queryKeys.roster.list(ITEM.id), [ENTRY]),
	];
}

async function render(path: string, ...seeds: Seed[]): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	for (const seed of seeds) seed(queryClient);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<InlineModals>
					<RouterProvider router={router} />
				</InlineModals>
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

/** One element by test id, from its opening tag to its matching close. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	const start = html.lastIndexOf("<", at);
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return html.slice(start);
}

const text = (html: string) => html.replaceAll("<!-- -->", "");
const PAGE = "/playbooks/template-booking";

describe("the builder's sections", () => {
	it("quotes alignment's doc, and marks qa's meaning not built", async () => {
		const html = await render(
			PAGE,
			...everything(preset([agent(ATLAS, ["A"])])),
		);
		const gates = element(html, "playbook-section-gates");
		expect(text(element(gates, "playbook-gate-doc-alignment"))).toContain(
			"Nothing verifies that claim.",
		);
		expect(tagOf(gates, "playbook-gate-doc-qa")).toContain(
			'data-state="not-built"',
		);
	});

	it("lists who can staff each wave, and flags a run wave no template declares", async () => {
		const html = await render(
			PAGE,
			...everything(preset([agent(ATLAS, ["A"])])),
		);
		expect(element(html, "playbook-wave-col-A")).toContain(">Atlas<");
		expect(element(html, "playbook-wave-col-B")).toContain(">Nemi<");
		// D runs, and no template declares it.
		expect(html).toContain('data-testid="playbook-wave-unstaffable-D"');
		// E does not run, so it is not flagged.
		expect(html).not.toContain('data-testid="playbook-wave-unstaffable-E"');
	});

	it("says each field's rule, and unknown where the contract can't answer", async () => {
		const html = text(
			await render(PAGE, ...everything(preset([agent(ATLAS, ["A"])]))),
		);
		expect(element(html, "playbook-field-rule-repo_url")).toContain(
			"The mission names a repository.",
		);
		expect(element(html, "playbook-field-rule-conventions")).toContain(
			"Unknown: the contract can&#x27;t answer",
		);
	});

	it("says the preset staffs the first wave when it does", async () => {
		const html = text(
			await render(PAGE, ...everything(preset([agent(ATLAS, ["A"])]))),
		);
		expect(tagOf(html, "playbook-preset-verdict")).toContain(
			'data-verdict="clear"',
		);
		expect(element(html, "playbook-preset-verdict")).toContain(
			"Staffs wave A, the first this playbook runs.",
		);
		expect(tagOf(html, "playbook-preset-board").length).toBeGreaterThan(0);
	});

	it("blocks with coherence's copy when the preset misses the first wave", async () => {
		const html = text(
			await render(PAGE, ...everything(preset([agent(NEMI, ["B"])]))),
		);
		expect(tagOf(html, "playbook-preset-verdict")).toContain(
			'data-verdict="block"',
		);
		expect(element(html, "playbook-preset-verdict")).toContain(
			"No active agent is in wave A",
		);
	});

	it("lists missions of the type with each field checked and a coherence verdict", async () => {
		const html = await render(
			PAGE,
			...everything(preset([agent(ATLAS, ["A"])])),
		);
		const row = element(html, `playbook-mission-${ITEM.id}`);
		expect(row).toContain(`href="/missions/${ITEM.id}/playbook"`);
		expect(row).toMatch(/data-check="missing" data-field="brief"/);
		expect(row).toMatch(/data-check="met" data-field="repo_url"/);
		expect(row).toMatch(/data-check="unknown" data-field="conventions"/);
		expect(row).toContain('data-verdict="clear"');
	});

	it("has no sections on a mission's own playbook page", async () => {
		const html = await render(
			`/missions/${ITEM.id}/playbook`,
			...everything(preset([agent(ATLAS, ["A"])])),
		);
		expect(html).toContain('data-testid="playbook-canvas"');
		expect(html).not.toContain('data-testid="playbook-sections"');
	});
});
