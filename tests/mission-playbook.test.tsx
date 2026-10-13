import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type AgentTemplate,
	agentTemplateSchema,
	type CoherenceResult,
	type MissionDetail,
	type MissionPlan,
	missionDetail,
	missionPlanSchema,
	type Playbook,
	playbookSchema,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { missionKeys } from "@/components/avel/mission-data";
import {
	blockCopy,
	CoherenceView,
	warningCopy,
} from "@/components/avel/playbook-coherence";
import { ApiError, ApiOverrideProvider, queryKeys } from "@/lib/api";
import { coherenceInputFor, inheritedTemplateIds } from "@/lib/api/coherence";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const ID = "0a1b2c3d-0000-4000-8000-000000000001";
const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SHA = "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d";

function mission(extra: Partial<MissionDetail> = {}): MissionDetail {
	return missionDetail.parse({
		id: ID,
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
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		brief: {},
		spendCeilingUsd: null,
		cutRationale: null,
		repoUrl: "https://github.com/example/app",
		roster: { agents: 2, active: 2 },
		playbook: { missionType: "template-booking", name: "Template booking" },
		recentActivity: [],
		...extra,
	});
}

const PLAYBOOK: Playbook = playbookSchema.parse({
	id: uuid(1),
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["C", "A", "B"],
	gates: [{ gate: "qa", policy: "mandatory" }],
	deliverable: "pr",
	requiredFields: [],
	defaultPresetId: uuid(301),
	version: 2,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-09T00:00:00.000Z",
});

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
		title: "Frontend engineer",
		identityVersion: null,
		identitySha256: null,
		identityStale: false,
		staleInputs: [],
		writablePaths: [`src/agent-${n}/**`],
		version: 1,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		...extra,
	});
}

function entry(
	n: number,
	from: AgentTemplate,
	extra: Partial<RosterEntry> = {},
): RosterEntry {
	return rosterEntrySchema.parse({
		id: uuid(200 + n),
		missionId: ID,
		agentTemplate: {
			id: from.id,
			slug: from.slug,
			name: from.name,
			kind: from.kind,
			roles: from.roles,
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
		createdAt: "2026-10-02T00:00:00.000Z",
		updatedAt: "2026-10-02T00:00:00.000Z",
		...extra,
	});
}

function plan(extra: Partial<MissionPlan> = {}): MissionPlan {
	return missionPlanSchema.parse({
		missionId: ID,
		brief: null,
		approvedBrief: null,
		templateRef: null,
		templateVersion: null,
		check: { passed: true, issues: [] },
		...extra,
	});
}

const T1 = template(1);
const T2 = template(2, { roles: ["foundations"], kind: "horizontal" });

// ---------------------------------------------------------------------------
// Rendering: the real app through the real router, signed in, with a query
// cache seeded the way the browser's requests would fill it.

type Seed = (client: QueryClient) => void;

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
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

const set =
	(key: readonly unknown[], value: unknown): Seed =>
	(client) =>
		client.setQueryData([...key], value);

const withMission = (m: MissionDetail) => set(missionKeys.detail(m.id), m);
const withPlan = (p: MissionPlan) => set(queryKeys.missionPlans.detail(ID), p);
const withPlaybook = (p: Playbook) =>
	set(queryKeys.playbooks.byType(p.missionType), p);
const withRoster = (r: RosterEntry[]) => set(queryKeys.roster.list(ID), r);
const withTemplates =
	(...templates: AgentTemplate[]): Seed =>
	(client) => {
		for (const t of templates) {
			client.setQueryData([...queryKeys.roster.template(t.id)], t);
		}
	};

const failing =
	(
		key: readonly unknown[],
		status: number,
		code: "NOT_FOUND" | "INTERNAL",
	): Seed =>
	(client) => {
		client
			.getQueryCache()
			.build(client, { queryKey: [...key] })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: new ApiError({
					method: "GET",
					path: "/api/x",
					kind: "contract",
					status,
					code,
					message: "for logs only",
					requestId: "req-1",
				}),
			});
	};

/** Everything a mission's playbook page reads, staffed in wave A. */
const everything = (m: MissionDetail = mission()): Seed[] => [
	withMission(m),
	withPlan(plan()),
	withPlaybook(PLAYBOOK),
	withRoster([entry(1, T1)]),
	withTemplates(T1),
];

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
const PAGE = `/missions/${ID}/playbook`;

// ---------------------------------------------------------------------------
// The input to coherence: pure.

describe("coherenceInputFor", () => {
	it("takes kind and roles from the entry's template, and keeps active and waves", () => {
		const input = coherenceInputFor(
			"vertical",
			[entry(1, T2, { active: false, waves: ["B", "C"] })],
			new Map([[T2.id, T2]]),
		);
		expect(input).toEqual({
			cut: "vertical",
			roster: [
				{
					id: uuid(201),
					active: false,
					waves: ["B", "C"],
					kind: "horizontal",
					roles: ["foundations"],
					writablePaths: ["src/agent-2/**"],
				},
			],
		});
	});

	it("keeps an entry's own paths over its template's, which it then never needs", () => {
		const input = coherenceInputFor(
			"horizontal",
			[entry(1, T1, { writablePaths: ["src/own/**"] })],
			new Map(),
		);
		expect(input?.roster[0]?.writablePaths).toEqual(["src/own/**"]);
	});

	it("is null while an inherited template is not loaded", () => {
		expect(
			coherenceInputFor("horizontal", [entry(1, T1)], new Map()),
		).toBeNull();
	});

	it("asks only for templates an entry inherits from, each once", () => {
		expect(
			inheritedTemplateIds([
				entry(1, T1),
				entry(2, T1),
				entry(3, T2, { writablePaths: ["x/**"] }),
			]),
		).toEqual([T1.id]);
	});
});

describe("coherence copy", () => {
	it("words the block by its wave, and a playbook with none apart", () => {
		expect(
			blockCopy({ code: "no_agents_in_first_wave", reason: "r", wave: "A" }),
		).toContain("No active agent is in wave A");
		expect(
			blockCopy({ code: "no_agents_in_first_wave", reason: "r", wave: null }),
		).toContain("This playbook declares no waves, so no wave can start.");
	});

	it("names each missing role, never the reason string", () => {
		const warn = (missing: ("foundations" | "verification")[]) =>
			warningCopy({
				code: "vertical_cut_roles_unassigned",
				reason: "NOT SHOWN",
				missing,
			});
		expect(warn(["foundations"])).toBe(
			"When the team is cut by feature, no active agent holds the foundations role.",
		);
		expect(warn(["foundations", "verification"])).toBe(
			"When the team is cut by feature, no active agent holds the foundations role or a verification role.",
		);
		const html = renderToString(
			<CoherenceView
				result={{
					warnings: [
						{
							code: "vertical_cut_roles_unassigned",
							reason: "NOT SHOWN",
							missing: ["verification"],
						},
					],
				}}
			/>,
		);
		expect(html).not.toContain("NOT SHOWN");
	});

	it("says the roster is clear only with no block and no warnings", () => {
		const view = (result: CoherenceResult) =>
			renderToString(<CoherenceView result={result} />);
		expect(view({ warnings: [] })).toContain('data-testid="coherence-clear"');
		expect(
			view({
				block: { code: "no_agents_in_first_wave", reason: "r", wave: "A" },
				warnings: [],
			}),
		).not.toContain("coherence-clear");
	});
});

// ---------------------------------------------------------------------------
// The route.

describe("/missions/$id/playbook", () => {
	it("titles the tab and crumbs back through the mission to Missions", async () => {
		const html = await render(PAGE, ...everything());
		expect(html).toContain(
			"<title>Playbook · Mission · Missions · AVEL</title>",
		);
		const crumbs = element(html, "breadcrumbs");
		expect(crumbs).toMatch(/href="\/missions"[^>]*>Missions</);
		// Named from the mission once it is read: an internal one by type and sprint.
		expect(crumbs).toMatch(
			new RegExp(`href="/missions/${ID}"[^>]*>template-booking, sprint 1<`),
		);
		expect(visibleText(crumbs)).not.toContain("0a1b2c3d");
	});

	it("is linked from the mission page, with or without a playbook", async () => {
		for (const m of [mission(), mission({ playbook: null })]) {
			const html = await render(`/missions/${ID}`, withMission(m));
			expect(tagOf(html, "mission-playbook-open")).toContain(`href="${PAGE}"`);
		}
	});

	it("shows the resolved playbook for the mission's type", async () => {
		const html = await render(PAGE, ...everything());
		expect(tagOf(html, "playbook-prop-name")).toContain(
			'value="Template booking"',
		);
		expect(tagOf(html, "mission-playbook-open-type")).toContain(
			'href="/playbooks/template-booking"',
		);
	});

	it("says so when no live playbook matches, with nothing to check", async () => {
		const html = await render(
			PAGE,
			withMission(mission({ playbook: null })),
			withPlan(plan()),
		);
		expect(html).toContain('data-testid="mission-playbook-none"');
		expect(html).toContain('data-testid="coherence-no-playbook"');
		expect(html).not.toContain('data-testid="playbook-builder"');
	});

	it("shows the template as ref@sha, seven characters, with the full sha on hover", async () => {
		const html = text(
			await render(
				PAGE,
				...everything(),
				withPlan(
					plan({ templateRef: "template-booking", templateVersion: SHA }),
				),
			),
		);
		const ref = element(html, "mission-playbook-template-ref");
		expect(ref).toContain(`title="template-booking@${SHA}"`);
		expect(ref).toContain(">template-booking@1a2b3c4<");
	});

	it("says there is no template when neither is set", async () => {
		const html = await render(PAGE, ...everything());
		expect(html).toContain('data-testid="mission-playbook-no-template"');
		expect(html).not.toContain("mission-playbook-template-ref");
	});

	it("answers a mission that is gone with NOT_FOUND and a way back", async () => {
		const html = await render(
			PAGE,
			failing(missionKeys.detail(ID), 404, "NOT_FOUND"),
		);
		expect(tagOf(html, "mission-playbook")).toContain('data-state="error"');
		expect(tagOf(html, "mission-playbook-back")).toContain('href="/missions"');
	});

	it("offers no way back for a failure that is not NOT_FOUND", async () => {
		const html = await render(
			PAGE,
			failing(missionKeys.detail(ID), 500, "INTERNAL"),
		);
		expect(tagOf(html, "mission-playbook")).toContain('data-state="error"');
		expect(html).not.toContain("mission-playbook-back");
	});
});

describe("coherence on the mission's playbook page", () => {
	const result = (html: string) => element(html, "mission-playbook-coherence");

	it("is clear when the earliest declared wave is staffed", async () => {
		// wavesApplicable lists C first; the earliest is A, in WAVES order.
		const html = await render(PAGE, ...everything());
		expect(result(html)).toContain('data-testid="coherence-clear"');
	});

	it("blocks when no active agent is in the earliest wave", async () => {
		const html = await render(
			PAGE,
			...everything(),
			// One in A but inactive, one active but in B.
			withRoster([
				entry(1, T1, { active: false }),
				entry(2, T1, { waves: ["B"] }),
			]),
		);
		expect(tagOf(result(html), "coherence-block")).toContain('data-wave="A"');
		expect(result(html)).toContain("No active agent is in wave A");
	});

	it("blocks with its own copy when the playbook declares no waves", async () => {
		const html = await render(
			PAGE,
			...everything(),
			withPlaybook({ ...PLAYBOOK, wavesApplicable: [] }),
		);
		expect(tagOf(result(html), "coherence-block")).toContain(
			'data-wave="none"',
		);
		expect(result(html)).toContain("This playbook declares no waves");
	});

	it("warns under a vertical cut with no foundations or verification role", async () => {
		const html = await render(
			PAGE,
			...everything(mission({ cut: "vertical" })),
		);
		expect(
			text(element(html, "coherence-warning-vertical_cut_roles_unassigned")),
		).toContain("the foundations role or a verification role");
		expect(result(html)).not.toContain("coherence-block");
	});

	it("waits for every template the roster inherits paths from", async () => {
		const html = await render(
			PAGE,
			withMission(mission()),
			withPlan(plan()),
			withPlaybook(PLAYBOOK),
			withRoster([entry(1, T1)]),
		);
		expect(tagOf(result(html), "coherence")).toContain('data-state="loading"');
	});

	it("shows the error map's copy when the roster can't be read", async () => {
		const html = await render(
			PAGE,
			withMission(mission()),
			withPlan(plan()),
			withPlaybook(PLAYBOOK),
			failing(queryKeys.roster.list(ID), 500, "INTERNAL"),
		);
		expect(tagOf(result(html), "coherence")).toContain('data-state="error"');
	});
});
