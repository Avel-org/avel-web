import {
	MutationObserver,
	QueryClient,
	QueryObserver,
} from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type AgentTemplate,
	agentTemplateSchema,
	type MissionDetail,
	type MissionSkill,
	missionDetail,
	type Playbook,
	playbookSchema,
	type RosterEntry,
	rosterEntrySchema,
	type SkillListItem,
	skillListItem,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	blockTarget,
	focusParam,
	gapTarget,
	parseFocus,
} from "@/components/avel/loadout-coherence";
import { missionKeys } from "@/components/avel/mission-data";
import { sendWith } from "@/components/avel/mission-skills-pane";
import { blockCopy } from "@/components/avel/playbook-coherence";
import {
	type ApiClient,
	ApiError,
	ApiOverrideProvider,
	queryKeys,
} from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import {
	attachRefusal,
	attachSkillOptions,
	detachSkillOptions,
	missionSkillTiers,
	recipientsOf,
} from "@/lib/api/mission-skills";
import { rosterReadOnlyReason } from "@/lib/api/roster";
import { SessionSourceProvider } from "@/lib/auth";
import { SKILL_ALREADY_ATTACHED } from "@/lib/error-map";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { SKILLS } from "./catalog-fixtures";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const ID = "0a1b2c3d-0000-4000-8000-000000000e09";
const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AT = "2026-10-01T00:00:00.000Z";

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
		createdAt: AT,
		updatedAt: AT,
		brief: {},
		spendCeilingUsd: null,
		spentUsd: 0,
		cutRationale: null,
		repoUrl: "https://github.com/example/app",
		roster: { agents: 2, active: 1 },
		playbook: { missionType: "template-booking", name: "Template booking" },
		recentActivity: [],
		...extra,
	});
}

const PLAYBOOK: Playbook = playbookSchema.parse({
	id: uuid(1),
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["B", "A"],
	gates: [],
	deliverable: "pr",
	requiredFields: [],
	defaultPresetId: uuid(301),
	version: 1,
	createdAt: AT,
	updatedAt: AT,
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
		createdAt: AT,
		updatedAt: AT,
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
		createdAt: AT,
		updatedAt: AT,
		...extra,
	});
}

const API = template(1);
const FOUNDATIONS = template(2, { roles: ["foundations"] });
const TESTS = template(3, { roles: ["backend-tests"] });

/** A list item from the catalog fixtures, its text dropped. */
function listItem(slug: string, extra: Partial<SkillListItem> = {}) {
	const found = SKILLS.find((s) => s.slug === slug);
	if (!found) throw new Error(`no fixture skill ${slug}`);
	const { contentMd: _c, avelEnhancementMd: _e, ...item } = found;
	return skillListItem.parse({ ...item, ...extra });
}

// Approved stack, for api-surface and interface: recommended for API.
const ROUTES = listItem("nextjs-route-handlers");
// Approved domain, recommended for no role on the roster: available.
const LEDGER = listItem("nextjs-route-handlers", {
	id: uuid(410),
	slug: "ledger-rules",
	name: "Ledger rules",
	layer: "domain",
	recommendedFor: ["domain"],
});
// Draft stack, and a role skill: in All only, never attachable.
const DRAFT = listItem("database-read");
const ROLE = listItem("criterion-tags");
const CATALOG = [ROUTES, LEDGER, DRAFT, ROLE];

const attached = (skill: SkillListItem): MissionSkill => ({
	skill,
	source: "manual",
});

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

const page = <T,>(rows: readonly T[]) => ({
	pages: [{ data: [...rows], meta: { nextCursor: null, total: rows.length } }],
	pageParams: [undefined],
});

const withMission = (m: MissionDetail = mission()) =>
	set(missionKeys.detail(m.id), m);
const withPlaybook = set(
	queryKeys.playbooks.byType("template-booking"),
	PLAYBOOK,
);
const withRoster = (r: RosterEntry[]) => set(queryKeys.roster.list(ID), r);
const withTemplates: Seed = (client) => {
	for (const t of [API, FOUNDATIONS, TESTS])
		client.setQueryData([...queryKeys.roster.template(t.id)], t);
	client.setQueryData(
		[...queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE)],
		page([API, FOUNDATIONS, TESTS]),
	);
};
const withSkills = (on: MissionSkill[]) => (client: QueryClient) => {
	client.setQueryData([...queryKeys.missionSkills.list(ID)], on);
	client.setQueryData(
		[...queryKeys.catalog.skills(CATALOG_PAGE_SIZE)],
		page(CATALOG),
	);
};

/** Everything the loadout reads, with a roster given. */
const loadout = (roster: RosterEntry[], on: MissionSkill[] = []): Seed[] => [
	withMission(),
	withPlaybook,
	withRoster(roster),
	withTemplates,
	withSkills(on),
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

const text = (html: string) =>
	html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
const LOADOUT = `/missions/${ID}/roster`;

/** A data-loadout-focus holding this token, alone or in a list (~=). */
const markedWith = (token: string) =>
	new RegExp(`data-loadout-focus="(?:[^"]* )?${token}(?: [^"]*)?"`);

// ---------------------------------------------------------------------------
// Coherence on the loadout.

describe("the loadout's coherence pane", () => {
	it("shows the first-wave block in the banner's words, and resolves it to the idle entry in that wave", async () => {
		const idle = entry(2, FOUNDATIONS, { active: false });
		const html = text(await render(LOADOUT, ...loadout([idle])));
		const block = element(html, "loadout-coherence-block");
		expect(tagOf(block, "loadout-coherence-block")).toContain('data-wave="A"');
		expect(block).toContain(
			text(
				blockCopy({ code: "no_agents_in_first_wave", reason: "", wave: "A" }),
			),
		);
		expect(tagOf(block, `loadout-resolve-entry:${idle.id}`)).toContain(
			`focus=entry%3A${idle.id}`,
		);
		// The board marks the same target, so Resolve lands on it.
		expect(html).toMatch(markedWith(`entry:${idle.id}`));
	});

	it("is clear when wave A is staffed", async () => {
		const html = await render(LOADOUT, ...loadout([entry(1, API)]));
		expect(html).toContain('data-testid="loadout-clear"');
		expect(html).not.toContain('data-testid="loadout-coherence-block"');
	});

	it("resolves each vertical-cut gap separately, to a palette role when no entry holds it", async () => {
		const html = text(
			await render(
				LOADOUT,
				withMission(mission({ cut: "vertical" })),
				withPlaybook,
				withRoster([entry(1, API), entry(3, TESTS, { active: false })]),
				withTemplates,
				withSkills([]),
			),
		);
		const warning = element(
			html,
			"loadout-warning-vertical_cut_roles_unassigned",
		);
		expect(warning).toContain('data-testid="loadout-resolve-role:foundations"');
		expect(html).toMatch(markedWith("role:foundations"));
		expect(warning).toContain(
			`data-testid="loadout-resolve-entry:${uuid(203)}"`,
		);
	});
});

describe("the coherence pane on a mission that is not a draft", () => {
	it("keeps each issue's words but offers no Resolve", async () => {
		const html = await render(
			LOADOUT,
			withMission(mission({ status: "active", cut: "vertical" })),
			withPlaybook,
			withRoster([entry(2, FOUNDATIONS, { active: false })]),
			withTemplates,
			withSkills([]),
		);
		const pane = element(html, "loadout-coherence");
		expect(pane).toContain('data-testid="loadout-coherence-block"');
		expect(pane).toContain(
			'data-testid="loadout-warning-vertical_cut_roles_unassigned"',
		);
		expect(pane).not.toContain('data-testid="loadout-resolve-');
	});
});

describe("focus targets", () => {
	it("round-trips through the param and rejects anything malformed", () => {
		for (const focus of [
			{ kind: "entry", id: uuid(201) },
			{ kind: "wave", wave: "C" },
			{ kind: "role", role: "foundations" },
		] as const) {
			expect(parseFocus(focusParam(focus))).toEqual(focus);
		}
		for (const bad of [
			undefined,
			"",
			"entry:",
			"wave:Z",
			"role:chef",
			"x:1",
			":a",
		]) {
			expect(parseFocus(bad), String(bad)).toBeNull();
		}
	});

	it("picks an idle entry in the wave, then an active one, then the column", () => {
		const idleIn = entry(1, API, { active: false, waves: ["A"] });
		const idleOut = entry(2, API, { active: false, waves: ["B"] });
		const busy = entry(3, API, { waves: ["B"] });
		expect(blockTarget("A", [busy, idleIn])).toEqual({
			kind: "entry",
			id: idleIn.id,
		});
		expect(blockTarget("A", [idleOut, busy])).toEqual({
			kind: "entry",
			id: busy.id,
		});
		expect(blockTarget("A", [idleOut])).toEqual({ kind: "wave", wave: "A" });
		expect(blockTarget(null, [idleIn])).toBeNull();
	});

	it("fills a gap with an idle holder of any of its roles, else the palette", () => {
		const idleTests = entry(3, TESTS, { active: false });
		expect(gapTarget("verification", [idleTests])).toEqual({
			kind: "entry",
			id: idleTests.id,
		});
		expect(gapTarget("foundations", [idleTests])).toEqual({
			kind: "role",
			role: "foundations",
		});
	});
});

// ---------------------------------------------------------------------------
// Mission skills.

describe("the mission skills pane", () => {
	it("lists what is attached, with its source and who receives it", async () => {
		const api = entry(1, API, { territory: "Billing" });
		const html = text(
			await render(LOADOUT, ...loadout([api], [attached(ROUTES)])),
		);
		const row = element(html, `mission-skill-${ROUTES.slug}`);
		expect(element(row, `mission-skill-source-${ROUTES.slug}`)).toContain(
			">manual<",
		);
		const reaches = element(row, `mission-skill-${ROUTES.slug}-recipients`);
		expect(reaches).toContain("Agent 1 · Billing");
		expect(row).toContain(`data-testid="mission-skill-detach-${ROUTES.slug}"`);
	});

	it("offers the recommended tier first, without what is already attached", async () => {
		const html = await render(LOADOUT, ...loadout([entry(1, API)]));
		const list = element(html, "mission-skills-tier-recommended-list");
		expect(list).toContain(`mission-skill-option-${ROUTES.slug}"`);
		expect(list).not.toContain(LEDGER.slug);
		expect(tagOf(html, "mission-skills-tier-recommended")).toContain(
			'aria-pressed="true"',
		);

		const on = await render(
			LOADOUT,
			...loadout([entry(1, API)], [attached(ROUTES)]),
		);
		expect(on).toContain('data-testid="mission-skills-tier-empty"');
	});

	it("says when a skill reaches no one on the roster", async () => {
		const html = text(
			await render(LOADOUT, ...loadout([entry(1, API)], [attached(LEDGER)])),
		);
		expect(element(html, `mission-skill-${LEDGER.slug}-recipients`)).toContain(
			"No agent on the roster holds a role it is recommended for.",
		);
	});
});

/** A held button's reason: the hidden span its aria-describedby names. */
function reasonOf(html: string, testid: string): string {
	const id = /aria-describedby="([^"]+)"/.exec(tagOf(html, testid))?.[1];
	expect(id, `${testid} has no reason`).toBeDefined();
	const span = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
	return text(span?.[1] ?? "");
}

describe("the mission skills pane on a mission that is not a draft", () => {
	it("holds attach and detach with mission_not_editable's reason", async () => {
		const html = text(
			await render(
				LOADOUT,
				withMission(mission({ status: "active" })),
				withPlaybook,
				withRoster([entry(1, API)]),
				withTemplates,
				withSkills([attached(LEDGER)]),
			),
		);
		const reason = rosterReadOnlyReason("active") ?? "";
		expect(reason).not.toBe("");
		for (const id of [
			`mission-skill-detach-${LEDGER.slug}`,
			`mission-skill-attach-${ROUTES.slug}`,
		]) {
			expect(tagOf(html, id)).toContain('disabled=""');
			expect(reasonOf(html, id)).toBe(text(reason));
		}
	});

	it("leaves them free on a draft", async () => {
		const html = await render(
			LOADOUT,
			...loadout([entry(1, API)], [attached(LEDGER)]),
		);
		expect(tagOf(html, `mission-skill-detach-${LEDGER.slug}`)).not.toContain(
			'disabled=""',
		);
		expect(tagOf(html, `mission-skill-attach-${ROUTES.slug}`)).not.toContain(
			'disabled=""',
		);
	});
});

describe("the tiers and the attach rule", () => {
	const roster = [entry(1, API)];

	it("follows resolveSkillTiers for the roster's roles, minus what is attached", () => {
		const tiers = missionSkillTiers(roster, CATALOG, []);
		expect(tiers.recommended.map((s) => s.slug)).toEqual([ROUTES.slug]);
		expect(tiers.available.map((s) => s.slug)).toEqual([LEDGER.slug]);
		expect(tiers.all.map((s) => s.slug)).toEqual(CATALOG.map((s) => s.slug));
		const after = missionSkillTiers(roster, CATALOG, [attached(ROUTES)]);
		expect(after.recommended).toEqual([]);
		expect(after.all.map((s) => s.slug)).not.toContain(ROUTES.slug);
	});

	it("attaches only approved stack and domain skills, and says why not", () => {
		expect(attachRefusal(ROUTES)).toBeNull();
		expect(attachRefusal(LEDGER)).toBeNull();
		expect(attachRefusal(DRAFT)).toMatch(/draft/);
		expect(attachRefusal(ROLE)).toMatch(/role skill/);
		expect(attachRefusal({ status: "retired", layer: "stack" })).toMatch(
			/retired/,
		);
	});

	it("names the entries holding a recommended role, idle ones included", () => {
		const idle = entry(2, API, { active: false });
		expect(
			recipientsOf(ROUTES, [...roster, idle, entry(3, TESTS)]).map((e) => e.id),
		).toEqual([uuid(201), uuid(202)]);
	});
});

// ---------------------------------------------------------------------------
// Writes: the options' mutationFn is replaced, so nothing is sent.

const NO_API = {} as ApiClient;

function conflict(code: "CONFLICT" | "NOT_FOUND", status: number) {
	return new ApiError({
		method: "POST",
		path: `/api/missions/${ID}/skills`,
		kind: "contract",
		status,
		code,
		message: "for logs only",
		requestId: "req-1",
	});
}

describe("a skill write", () => {
	function client() {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		qc.setQueryData([...queryKeys.missionSkills.list(ID)], [attached(LEDGER)]);
		return qc;
	}
	const stale = (qc: QueryClient) =>
		qc.getQueryState([...queryKeys.missionSkills.list(ID)])?.isInvalidated;

	it("attach: the answer joins the cached list", async () => {
		const qc = client();
		await new MutationObserver(qc, {
			...attachSkillOptions(NO_API, qc, ID),
			mutationFn: async (_skillId: string) => attached(ROUTES),
		}).mutate(ROUTES.id);
		expect(
			qc
				.getQueryData<MissionSkill[]>([...queryKeys.missionSkills.list(ID)])
				?.map((s) => s.skill.slug),
		).toEqual([LEDGER.slug, ROUTES.slug]);
	});

	it("attach 409: refetches the list, and its copy says the skill is already on", async () => {
		const qc = client();
		const observer = new MutationObserver(qc, {
			...attachSkillOptions(NO_API, qc, ID),
			mutationFn: (_skillId: string): Promise<MissionSkill> =>
				Promise.reject(conflict("CONFLICT", 409)),
		});
		await observer.mutate(ROUTES.id).catch(() => {});
		expect(stale(qc)).toBe(true);
		expect(SKILL_ALREADY_ATTACHED.what).toBe(
			"This skill is already on the mission.",
		);
	});

	it("detach: the skill leaves the cached list at once", async () => {
		const qc = client();
		await new MutationObserver(qc, {
			...detachSkillOptions(NO_API, qc, ID),
			mutationFn: async (_skillId: string) => ({ id: LEDGER.id }),
		}).mutate(LEDGER.id);
		expect(qc.getQueryData([...queryKeys.missionSkills.list(ID)])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The mission overview links to the loadout.

describe("the pane's failure row", () => {
	it("shows only the latest write's failure", async () => {
		let shown: ApiError | null = null;
		const send = sendWith((failure) => {
			shown = failure;
		});
		const was409 = conflict("CONFLICT", 409);
		await send(() => Promise.reject(was409));
		expect(shown).toBe(was409);
		const gone = conflict("NOT_FOUND", 404);
		await send(() => Promise.reject(gone));
		expect(shown).toBe(gone);
		await send(async () => undefined);
		expect(shown).toBeNull();
	});
});

describe("attach, through the API client", () => {
	it("sends the skill id for this mission, then reads the list again", async () => {
		const answer = <T,>(status: number, data: T) => ({
			status,
			body: { success: true as const, data },
			headers: new Headers(),
		});
		const attachSkill = vi.fn(async (_req: unknown) =>
			answer(201, attached(ROUTES)),
		);
		const skills = vi.fn(async (_req: unknown) =>
			answer(200, [attached(LEDGER), attached(ROUTES)]),
		);
		const api = { roster: { attachSkill, skills } } as unknown as ApiClient;
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		qc.setQueryData([...queryKeys.missionSkills.list(ID)], [attached(LEDGER)]);
		// A mounted reader of the list, as the pane is: invalidation refetches it.
		const reader = new QueryObserver(qc, {
			queryKey: [...queryKeys.missionSkills.list(ID)],
			queryFn: () => skills({}).then((r) => r.body.data),
			staleTime: Number.POSITIVE_INFINITY,
		});
		const unsubscribe = reader.subscribe(() => {});
		await new MutationObserver(qc, attachSkillOptions(api, qc, ID)).mutate(
			ROUTES.id,
		);
		unsubscribe();
		expect(attachSkill).toHaveBeenCalledWith({
			params: { missionId: ID },
			body: { skillId: ROUTES.id },
		});
		expect(skills).toHaveBeenCalledTimes(1);
		expect(
			qc
				.getQueryData<MissionSkill[]>([...queryKeys.missionSkills.list(ID)])
				?.map((s) => s.skill.slug),
		).toEqual([LEDGER.slug, ROUTES.slug]);
	});
});

describe("the mission page's team panel", () => {
	it("links to the loadout", async () => {
		const html = await render(`/missions/${ID}`, withMission());
		expect(tagOf(html, "mission-loadout-open")).toContain(`href="${LOADOUT}"`);
	});
});
