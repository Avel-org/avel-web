import {
	MutationObserver,
	QueryClient,
	QueryClientProvider,
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
	missionDetail,
	type Playbook,
	type Preset,
	playbookSchema,
	presetSchema,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	dropCopies,
	reclaimsFocus,
	roleMarkers,
	shownWaves,
} from "@/components/avel/loadout-board";
import {
	EntryEditor,
	SaveRosterPresetForm,
} from "@/components/avel/loadout-entry";
import {
	focusSelector,
	landableFocus,
	landOn,
} from "@/components/avel/loadout-page";
import { missionKeys } from "@/components/avel/mission-data";
import { blockCopy } from "@/components/avel/playbook-coherence";
import { ApplyToMissionSteps } from "@/components/avel/preset-apply";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	type ApiClient,
	ApiOverrideProvider,
	ApiProvider,
	queryKeys,
} from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import {
	addRosterEntryOptions,
	cachedRoster,
	chipWaves,
	entryDraftOf,
	entryFieldOf,
	entryPatchOf,
	entryProblems,
	presetBodyFromRoster,
	rosterIssueCopy,
	settleRosterWrite,
	updateRosterEntryOptions,
	withoutWave,
} from "@/lib/api/roster";
import { SessionSourceProvider } from "@/lib/auth";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { Route as LoadoutRoute } from "@/routes/missions_.$id_.roster";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { contractError, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const ID = "0a1b2c3d-0000-4000-8000-0000000000e9";
const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PAGE = `/missions/${ID}/roster`;

function mission(extra: Partial<MissionDetail> = {}): MissionDetail {
	return missionDetail.parse({
		id: ID,
		origin: "internal",
		type: "template-booking",
		sprintN: 1,
		status: "draft",
		cut: "vertical",
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

/** Declares C, A and B: the earliest is A, whatever the order. */
const PLAYBOOK: Playbook = playbookSchema.parse({
	id: uuid(1),
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["C", "A", "B"],
	gates: [],
	deliverable: "pr",
	requiredFields: [],
	defaultPresetId: uuid(301),
	version: 1,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
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

/** Foundations and a verification role: first for both. */
const ATLAS = template(1, {
	name: "Atlas",
	slug: "atlas",
	roles: ["foundations", "backend-tests"],
});
const NEMI = template(2, { name: "Nemi", slug: "nemi" });
/** Firm: shown, never addable. */
const CANON = template(3, { name: "Canon", slug: "canon", roles: ["intake"] });
/** Foundations again: not first, so it carries no marker. */
const ORLA = template(4, {
	name: "Orla",
	slug: "orla",
	roles: ["foundations"],
});

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

function preset(extra: Partial<Preset> = {}): Preset {
	return presetSchema.parse({
		id: uuid(300),
		name: "Booking squad",
		description: null,
		cut: "vertical",
		agents: [
			{
				agentTemplateId: NEMI.id,
				waves: ["B"],
				territory: null,
				writablePaths: null,
				estimatedTokens: null,
			},
		],
		version: 2,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		...extra,
	});
}

// ---------------------------------------------------------------------------
// Rendering: the real route through the real router, signed in, with a
// query cache seeded the way the browser's requests would fill it.

type Seed = (client: QueryClient) => void;

const set =
	(key: readonly unknown[], value: unknown): Seed =>
	(client) =>
		client.setQueryData([...key], value);

const withMission = (m: MissionDetail) => set(missionKeys.detail(m.id), m);
const withRoster = (r: RosterEntry[]) => set(queryKeys.roster.list(ID), r);
const withCatalog = (...templates: AgentTemplate[]): Seed => {
	return (client) => {
		client.setQueryData(queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE), {
			pages: [{ data: templates, meta: { nextCursor: null } }],
			pageParams: [undefined],
		});
		// The coherence input reads each inherited template by id.
		for (const t of templates)
			client.setQueryData([...queryKeys.roster.template(t.id)], t);
	};
};

/** Everything the page reads: a draft, Atlas active in A, Nemi idle in B and C. */
const everything = (
	m: MissionDetail = mission(),
	roster: RosterEntry[] = [
		entry(1, ATLAS),
		entry(2, NEMI, { active: false, waves: ["B", "C"], territory: "Booking" }),
	],
): Seed[] => [
	withMission(m),
	set(queryKeys.playbooks.byType(PLAYBOOK.missionType), PLAYBOOK),
	withRoster(roster),
	withCatalog(ATLAS, NEMI, CANON, ORLA),
];

async function renderRoute(path: string, ...seeds: Seed[]): Promise<string> {
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

/** A component inside the real ApiProvider, modals in place. */
function render(node: ReactNode, seed: Seed = () => {}) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	seed(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<InlineModals>{node}</InlineModals>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
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

const text = (html: string) =>
	html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");

// ---------------------------------------------------------------------------
// The page.

describe("the loadout board", () => {
	it("puts each entry in each of its waves, A to E", async () => {
		const html = await renderRoute(PAGE, ...everything());
		const a = element(html, "loadout-wave-A");
		const b = element(html, "loadout-wave-B");
		const c = element(html, "loadout-wave-C");
		expect(a).toContain(`loadout-chip-${uuid(201)}-A`);
		expect(b).toContain(`loadout-chip-${uuid(202)}-B`);
		expect(c).toContain(`loadout-chip-${uuid(202)}-C`);
		expect(element(html, "loadout-wave-D")).not.toContain("loadout-chip-");
		// Active of all, per wave: Nemi is idle.
		expect(text(b)).toContain(">0/1<");
		expect(text(a)).toContain(">1/1<");
		expect(text(element(html, "loadout-wave-A"))).toContain("Setup");
	});

	it("shows each entry's active state on its switch", async () => {
		const html = await renderRoute(PAGE, ...everything());
		expect(tagOf(html, `loadout-chip-${uuid(201)}-A-active`)).toContain(
			'aria-checked="true"',
		);
		expect(tagOf(html, `loadout-chip-${uuid(202)}-B-active`)).toContain(
			'aria-checked="false"',
		);
	});

	it("offers rosterable templates and holds a Firm one, saying why", async () => {
		const html = await renderRoute(PAGE, ...everything());
		const palette = element(html, "loadout-palette");
		expect(tagOf(palette, "loadout-palette-atlas")).not.toContain(
			'disabled=""',
		);
		expect(text(element(html, "loadout-palette-canon"))).toContain("Canon");
		expect(tagOf(palette, "loadout-palette-canon")).toContain('disabled=""');
		expect(text(html)).toContain(
			PRECONDITION_COPY.template_not_rosterable.what,
		);
	});

	it("starts with an empty board and the palette when the roster is empty", async () => {
		const html = await renderRoute(PAGE, ...everything(mission(), []));
		expect(html).toContain('data-testid="loadout-empty"');
		expect(html).toContain('data-testid="loadout-board"');
	});
});

describe("the one hard block", () => {
	it("blocks, on the banner and the earliest wave, when no active agent is in it", async () => {
		const html = await renderRoute(
			PAGE,
			...everything(mission(), [entry(1, ATLAS, { active: false })]),
		);
		const banner = element(html, "loadout-block");
		expect(banner).toContain('role="alert"');
		expect(text(banner)).toContain(
			blockCopy({ code: "no_agents_in_first_wave", reason: "", wave: "A" }),
		);
		// The wave is the result's (computeCoherence), A for C, A, B.
		expect(tagOf(html, "loadout-wave-A")).toContain("data-blocked");
		expect(tagOf(html, "loadout-wave-B")).not.toContain("data-blocked");
		expect(html).toContain('data-testid="loadout-wave-A-blocked"');
	});

	it("is gone once an active agent is in the earliest wave", async () => {
		const html = await renderRoute(PAGE, ...everything());
		expect(html).not.toContain('data-testid="loadout-block"');
		expect(tagOf(html, "loadout-wave-A")).not.toContain("data-blocked");
	});
});

describe("a mission that is not a draft", () => {
	it("shows the roster read-only with mission_not_editable's reason", async () => {
		const html = await renderRoute(
			PAGE,
			...everything(mission({ status: "active" })),
		);
		const copy = PRECONDITION_COPY.mission_not_editable;
		expect(text(element(html, "loadout-read-only"))).toContain(
			`${copy.what} ${copy.next}`,
		);
		expect(tagOf(html, "loadout-apply-open")).toContain('disabled=""');
		expect(tagOf(html, `loadout-chip-${uuid(201)}-A-active`)).toContain(
			'disabled=""',
		);
		expect(tagOf(html, `loadout-chip-${uuid(201)}-A-remove`)).toContain(
			'disabled=""',
		);
		expect(tagOf(html, "loadout-palette-atlas")).toContain('disabled=""');
	});

	it("is editable as a draft", async () => {
		const html = await renderRoute(PAGE, ...everything());
		expect(html).not.toContain('data-testid="loadout-read-only"');
		expect(tagOf(html, "loadout-apply-open")).not.toContain('disabled=""');
	});
});

describe("the table view", () => {
	it("is a toggle behind the board, one row per entry", async () => {
		const html = await renderRoute(`${PAGE}?view=table`, ...everything());
		expect(html).toContain('data-testid="loadout-table"');
		expect(html).not.toContain('data-testid="loadout-board"');
		expect(text(element(html, `loadout-row-${uuid(202)}`))).toContain(
			"Nemi · Booking",
		);
		expect(tagOf(html, "loadout-view-table")).toContain('aria-pressed="true"');
	});

	it("opens on the board", async () => {
		const html = await renderRoute(PAGE, ...everything());
		expect(tagOf(html, "loadout-view-board")).toContain('aria-pressed="true"');
		expect(html).not.toContain('data-testid="loadout-table"');
	});
});

describe("where Resolve lands", () => {
	it("marks an entry once, on its first wave", async () => {
		const html = await renderRoute(PAGE, ...everything());
		const marker = `data-loadout-focus="entry:${uuid(202)}"`;
		expect(tagOf(html, `loadout-chip-${uuid(202)}-B`)).toContain(marker);
		expect(tagOf(html, `loadout-chip-${uuid(202)}-C`)).not.toContain(
			"data-loadout-focus",
		);
	});

	it("marks every wave, and the first rosterable template for each role", async () => {
		const html = await renderRoute(PAGE, ...everything());
		expect(tagOf(html, "loadout-wave-D")).toContain(
			'data-loadout-focus="wave:D"',
		);
		const atlas = element(
			element(html, "loadout-palette"),
			"loadout-palette-atlas",
		);
		expect(atlas).toBeTruthy();
		expect(html).toContain(
			'data-loadout-focus="role:foundations role:backend-tests"',
		);
		expect(html).toContain('data-loadout-focus="role:api-surface"');
		// Orla is second for foundations; Canon is Firm.
		expect(html.match(/role:foundations/g)).toHaveLength(1);
		expect(html).not.toContain("role:intake");
	});

	it("finds a marker in a space-separated list", () => {
		expect(focusSelector("role:backend-tests")).toBe(
			'[data-loadout-focus~="role:backend-tests"]',
		);
		const marked = roleMarkers([CANON, ATLAS, ORLA, NEMI]);
		expect(marked.get(ATLAS.id)).toEqual(["foundations", "backend-tests"]);
		expect(marked.has(ORLA.id)).toBe(false);
		expect(marked.has(CANON.id)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Writes.

describe("after a roster write", () => {
	it("puts the answer in the cached roster at once and reads it again", async () => {
		const qc = new QueryClient();
		const key = [...queryKeys.roster.list(ID)];
		qc.setQueryData(key, [entry(1, ATLAS)]);
		await settleRosterWrite(qc, ID, (r) => [
			...r,
			entry(2, NEMI, { waves: ["B"] }),
		]);
		expect(
			qc.getQueryData<RosterEntry[]>(key)?.map((e) => e.agentTemplate.slug),
		).toEqual(["atlas", "nemi"]);
		expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});
});

describe("moving a chip", () => {
	it("shows a held chip where it is carried, sending nothing yet", () => {
		const e = entry(1, ATLAS, { waves: ["A", "C"] });
		expect(shownWaves(e, { entryId: e.id, from: "C", at: "D" })).toEqual([
			"A",
			"D",
		]);
		expect(shownWaves(e, null)).toEqual(["A", "C"]);
		expect(shownWaves(e, { entryId: uuid(999), from: "A", at: "B" })).toEqual([
			"A",
			"C",
		]);
	});

	it("takes a wave away, but never the last", () => {
		expect(withoutWave(["A", "B"], "A")).toEqual(["B"]);
		expect(withoutWave(["A"], "A")).toBeNull();
	});
});

describe("the entry editor", () => {
	const e = entry(1, ATLAS, {
		estimatedTokens: 1000,
		tokenSoftCeiling: 1500,
		tokenHardCeiling: 3000,
	});

	it("sends only what changed, empty as null", () => {
		const draft = entryDraftOf(e);
		expect(entryPatchOf(e, draft)).toBeNull();
		expect(
			entryPatchOf(e, {
				...draft,
				territory: " Booking ",
				tokenHardCeiling: "",
			}),
		).toEqual({ territory: "Booking", tokenHardCeiling: null });
	});

	it("checks the patch with updateRosterEntryBody, per field", () => {
		const draft = entryDraftOf(e);
		expect(entryProblems(e, { ...draft, estimatedTokens: "12.5" })).toEqual({
			estimatedTokens: rosterIssueCopy({ path: ["estimatedTokens"] }),
		});
		expect(
			Object.keys(entryProblems(e, { ...draft, territory: "x".repeat(201) })),
		).toEqual(["territory"]);
	});

	it("checks the entry as it would stand with rosterEntryProblems", () => {
		const draft = entryDraftOf(e);
		// Soft under the estimate the entry already has.
		expect(
			Object.keys(entryProblems(e, { ...draft, tokenSoftCeiling: "500" })),
		).toEqual(["tokenSoftCeiling"]);
		expect(
			Object.keys(entryProblems(e, { ...draft, tokenHardCeiling: "1200" })),
		).toEqual(["tokenHardCeiling"]);
		expect(entryProblems(e, { ...draft, tokenHardCeiling: "4000" })).toEqual(
			{},
		);
	});

	it("puts a refusal on its field by path, and the refine's on the row", () => {
		expect(entryFieldOf(["tokenHardCeiling"])).toBe("tokenHardCeiling");
		expect(entryFieldOf([])).toBeNull();
		expect(entryFieldOf(["absorbedBoundaries"])).toBeNull();
		const html = render(
			<EntryEditor
				entry={e}
				readOnlyReason={null}
				pending={false}
				error={contractError(400, "VALIDATION_FAILED", {
					body: [
						{ path: ["tokenHardCeiling"], message: "for logs" },
						{ path: [], message: "Give at least one field to change" },
					],
				})}
				onSave={() => {}}
			/>,
		);
		expect(
			text(element(html, "loadout-entry-tokenHardCeiling-error")),
		).toContain(rosterIssueCopy({ path: ["tokenHardCeiling"] }));
		expect(html).toContain('data-testid="action-modal-unplaced"');
		expect(html).not.toContain("for logs");
	});

	it("holds Save until something changed, saying why", () => {
		const html = render(
			<EntryEditor
				entry={e}
				readOnlyReason={null}
				pending={false}
				error={null}
				onSave={() => {}}
			/>,
		);
		expect(text(html)).toContain("Change a field first.");
	});
});

describe("save as preset", () => {
	const roster = [
		entry(1, ATLAS, { waves: ["A", "C"], estimatedTokens: 900 }),
		entry(2, NEMI, { active: false, territory: "Booking" }),
	];

	it("copies the active entries and leaves the idle out", () => {
		expect(
			presetBodyFromRoster(roster, {
				name: " Squad ",
				description: "",
				cut: "vertical",
			}),
		).toEqual({
			name: "Squad",
			cut: "vertical",
			agents: [
				{
					agentTemplateId: ATLAS.id,
					waves: ["A", "C"],
					territory: null,
					writablePaths: null,
					estimatedTokens: 900,
				},
			],
		});
	});

	it("names the idle entries it leaves out, and counts the rest", () => {
		const html = text(
			render(
				<SaveRosterPresetForm
					roster={roster}
					cut="vertical"
					pending={false}
					error={null}
					onSave={() => {}}
				/>,
			),
		);
		expect(html).toContain("Left out, being idle: Nemi · Booking.");
		expect(html).toContain("Save 1 agent as a team");
		expect(html).toContain('data-state="checked"');
	});
});

describe("applying a preset from the loadout", () => {
	it("previews over the roster and asks to replace what is there", () => {
		const html = render(
			<ApplyToMissionSteps
				mission={mission()}
				names={{ status: "success", byId: new Map([[NEMI.id, NEMI]]) }}
				initialPreset={preset()}
			/>,
			(qc) => {
				for (const seed of everything()) seed(qc);
				qc.setQueryData(queryKeys.presets.list(50, {}), {
					pages: [{ data: [preset()], meta: { nextCursor: null } }],
					pageParams: [undefined],
				});
			},
		);
		expect(html).toContain('data-testid="preset-apply-replace"');
		expect(text(html)).toContain("Choose to replace them");
		expect(html).toContain('data-testid="preset-apply-coherence-before"');
	});
});

// ---------------------------------------------------------------------------
// Review fixes: moves in flight, focus, landing, adding a wave.

const NO_API = {} as ApiClient;

/** A query client holding the roster, nothing ever stale on its own. */
function rosterClient(roster: RosterEntry[]) {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	qc.setQueryData([...queryKeys.roster.list(ID)], roster);
	return qc;
}

/** A promise the test settles by hand: a request still in flight. */
function inFlight<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("two moves in a row", () => {
	const ATLAS_AB = entry(1, ATLAS, { waves: ["A", "B"] });

	it("builds the second move on the first, still in flight", async () => {
		const qc = rosterClient([ATLAS_AB]);
		const sent: unknown[] = [];
		const first = inFlight<RosterEntry>();
		const observer = () =>
			new MutationObserver(qc, {
				...updateRosterEntryOptions(NO_API, qc, ID),
				mutationFn: (vars) => {
					sent.push(vars.patch);
					return first.promise;
				},
			});
		// A to C, then B to D before the first answers.
		const one = chipWaves(cachedRoster(qc, ID), ATLAS_AB.id, "A", "C");
		void observer().mutate({
			entryId: ATLAS_AB.id,
			patch: { waves: one ?? [] },
		});
		await tick();
		const two = chipWaves(cachedRoster(qc, ID), ATLAS_AB.id, "B", "D");
		void observer().mutate({
			entryId: ATLAS_AB.id,
			patch: { waves: two ?? [] },
		});
		await tick();
		expect(sent).toEqual([{ waves: ["B", "C"] }, { waves: ["C", "D"] }]);
		first.resolve({ ...ATLAS_AB, waves: ["C", "D"] });
	});

	it("puts the entry back when the server refuses", async () => {
		const qc = rosterClient([ATLAS_AB]);
		const request = inFlight<RosterEntry>();
		const observer = new MutationObserver(qc, {
			...updateRosterEntryOptions(NO_API, qc, ID),
			mutationFn: () => request.promise,
		});
		const done = observer
			.mutate({ entryId: ATLAS_AB.id, patch: { waves: ["B", "C"] } })
			.catch(() => {});
		await tick();
		expect(cachedRoster(qc, ID)?.[0]?.waves).toEqual(["B", "C"]);
		request.reject(contractError(400, "VALIDATION_FAILED"));
		await done;
		expect(cachedRoster(qc, ID)?.[0]?.waves).toEqual(["A", "B"]);
	});

	it("takes the server's answer for the entry", async () => {
		const qc = rosterClient([ATLAS_AB]);
		await new MutationObserver(qc, {
			...updateRosterEntryOptions(NO_API, qc, ID),
			mutationFn: async () =>
				entry(1, ATLAS, { waves: ["C"], territory: "Hub" }),
		}).mutate({ entryId: ATLAS_AB.id, patch: { waves: ["C"] } });
		expect(cachedRoster(qc, ID)?.[0]?.territory).toBe("Hub");
	});

	it("reads the roster again only when no other write is in flight", async () => {
		const qc = rosterClient([ATLAS_AB]);
		const key = [...queryKeys.roster.list(ID)];
		const slow = inFlight<RosterEntry>();
		void new MutationObserver(qc, {
			...updateRosterEntryOptions(NO_API, qc, ID),
			mutationFn: () => slow.promise,
		}).mutate({ entryId: ATLAS_AB.id, patch: { active: false } });
		await new MutationObserver(qc, {
			...updateRosterEntryOptions(NO_API, qc, ID),
			mutationFn: async () => entry(1, ATLAS, { waves: ["C"] }),
		}).mutate({ entryId: ATLAS_AB.id, patch: { waves: ["C"] } });
		expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
		slow.resolve({ ...ATLAS_AB, waves: ["C"], active: false });
		await tick();
		expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});
});

describe("after any roster write", () => {
	it("reads the mission again, for its Team counts", async () => {
		const qc = rosterClient([entry(1, ATLAS)]);
		qc.setQueryData([...missionKeys.detail(ID)], mission());
		await settleRosterWrite(qc, ID, (r) => r);
		expect(qc.getQueryState([...missionKeys.detail(ID)])?.isInvalidated).toBe(
			true,
		);
	});

	it("seeds an added agent's template, so coherence never drops to loading", async () => {
		const qc = rosterClient([]);
		await new MutationObserver(qc, {
			...addRosterEntryOptions(NO_API, qc, ID),
			mutationFn: async () => entry(2, NEMI),
		}).mutate({
			body: { agentTemplateId: NEMI.id, waves: ["A"] },
			template: NEMI,
		});
		expect(qc.getQueryData([...queryKeys.roster.template(NEMI.id)])).toEqual(
			NEMI,
		);
	});
});

describe("adding a wave from the board", () => {
	it("adds the wave beside the one it left, in order", () => {
		const roster = [entry(1, ATLAS, { waves: ["C"] })];
		expect(chipWaves(roster, uuid(201), "C", "A", true)).toEqual(["A", "C"]);
		expect(chipWaves(roster, uuid(201), "C", "A")).toEqual(["A"]);
		expect(chipWaves(roster, uuid(201), "C", "C", true)).toBeNull();
	});

	it("adds on a drop with Alt, Ctrl or Cmd held", () => {
		const keys = { altKey: false, ctrlKey: false, metaKey: false };
		expect(dropCopies(keys)).toBe(false);
		expect(dropCopies({ ...keys, altKey: true })).toBe(true);
		expect(dropCopies({ ...keys, ctrlKey: true })).toBe(true);
		expect(dropCopies({ ...keys, metaKey: true })).toBe(true);
	});

	it("says how, on an editable board only", async () => {
		const draft = await renderRoute(PAGE, ...everything());
		expect(text(element(draft, "loadout-board-keys"))).toContain(
			"Shift+Enter adds that wave",
		);
		const shipped = await renderRoute(
			PAGE,
			...everything(mission({ status: "shipped" })),
		);
		expect(shipped).not.toContain('data-testid="loadout-board-keys"');
	});
});

describe("the keyboard after a put-down", () => {
	it("takes focus back to the moved chip only when focus fell to the page", () => {
		const body = { tag: "body" } as unknown as Element;
		const other = { tag: "input" } as unknown as Element;
		const chip = { entryId: uuid(201), wave: "C" as const };
		expect(reclaimsFocus(chip, "C", body, body)).toBe(true);
		expect(reclaimsFocus(chip, "C", null, body)).toBe(true);
		expect(reclaimsFocus(chip, "B", body, body)).toBe(false);
		expect(reclaimsFocus(chip, "C", other, body)).toBe(false);
	});
});

describe("a Resolve link's focus", () => {
	it("keeps only what parses and is safe in a selector", () => {
		expect(landableFocus(`entry:${uuid(201)}`)).toBe(`entry:${uuid(201)}`);
		expect(landableFocus("wave:B")).toBe("wave:B");
		expect(landableFocus("role:backend-tests")).toBe("role:backend-tests");
		expect(landableFocus("a\\")).toBeNull();
		expect(landableFocus('entry:a"]')).toBeNull();
		expect(landableFocus("wave:Z")).toBeNull();
		expect(landableFocus(undefined)).toBeNull();
	});

	it("drops a malformed focus from the URL, and keeps a good one", () => {
		// The route's schema, as the router runs it on every URL.
		const schema = LoadoutRoute.options.validateSearch as unknown as {
			parse: (search: unknown) => { view?: string; focus?: string };
		};
		const validate = (search: Record<string, unknown>) => schema.parse(search);
		expect(validate({ focus: "a\\" }).focus).toBeUndefined();
		expect(validate({ focus: "wave:B", view: "table" })).toEqual({
			focus: "wave:B",
			view: "table",
		});
	});

	it("lands every time it is asked, making the target focusable", () => {
		const calls: string[] = [];
		const classes = new Set<string>();
		const el = {
			tabIndex: -1,
			hasAttribute: () => false,
			setAttribute: (name: string, value: string) =>
				calls.push(`${name}=${value}`),
			scrollIntoView: () => calls.push("scroll"),
			focus: () => calls.push("focus"),
			classList: {
				add: (c: string) => classes.add(c),
				remove: (c: string) => classes.delete(c),
			},
			offsetWidth: 0,
			addEventListener: () => {},
		};
		const root = {
			querySelector: (selector: string) =>
				// Only what landOn touches; the cast stands in for a DOM element.
				selector === focusSelector("wave:B") ? (el as never) : null,
		};
		expect(landOn(root, "wave:B")).toBe(true);
		expect(landOn(root, "wave:B")).toBe(true);
		expect(calls).toEqual([
			"tabindex=-1",
			"scroll",
			"focus",
			"tabindex=-1",
			"scroll",
			"focus",
		]);
		expect(classes.has("landed")).toBe(true);
		expect(landOn(root, "wave:C")).toBe(false);
	});
});
