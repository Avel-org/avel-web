import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ApiFetcher } from "@ts-rest/core";
import {
	type Brief,
	type CompletionReport,
	completionReport,
	type Dispatch,
	dispatch,
	type MissionDetail,
	missionDetail,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { DispatchCard } from "@/components/avel/dispatch-board";
import {
	DispatchControls,
	dispatchRefusalLine,
} from "@/components/avel/dispatch-controls";
import {
	bodyOf,
	dispatchFieldOf,
	draftProblems,
	initialDraft,
	NewDispatch,
	NewDispatchForm,
	refusedAgentsLine,
} from "@/components/avel/dispatch-new";
import { missionKeys } from "@/components/avel/mission-data";
import {
	DispatchReport,
	producersOf,
	reportsById,
	showsDispatches,
} from "@/components/avel/mission-dispatches";
import { haltNote } from "@/components/avel/mission-start";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ApiOverrideProvider, createApiClient } from "@/lib/api";
import {
	afterDispatchMoved,
	attemptFor,
	createDispatchRequest,
	DISPATCH_POLL_MS,
	haltDispatchRequest,
	missionDispatchesQuery,
	startDispatchRequest,
} from "@/lib/api/dispatches";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { PREVIEW_USER, SignedInProvider } from "@/shell/auth-gate";
import { signedIn } from "./auth-session";
import { inProviders, seededClient } from "./catalog-fixtures";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract.

const MISSION_ID = "7ecead58-5eed-4000-8000-000000000100";
const LEON_ENTRY = "7ecead58-5eed-4000-8000-000000000101";
const ATLAS_ENTRY = "7ecead58-5eed-4000-8000-000000000102";
const RUNNING_ID = "7ecead58-5eed-4000-8000-000000000216";
const DONE_ID = "7ecead58-5eed-4000-8000-000000000217";
const QUEUED_ID = "7ecead58-5eed-4000-8000-000000000218";
const REPORT_ID = "7ecead58-5eed-4000-8000-000000000301";
const ISO = "2026-10-13T12:00:00.000Z";
const hash = (c: string) => c.repeat(64);

const AGENTS = {
	leon: {
		templateId: "7ecead58-5eed-4000-8000-000000000201",
		slug: "leon",
		name: "Leon",
		title: "Frontend engineer",
	},
	atlas: {
		templateId: "7ecead58-5eed-4000-8000-000000000202",
		slug: "atlas",
		name: "Atlas",
		title: "Full-stack lead",
	},
};

function dispatchOf(over: Partial<Dispatch> & { id: string }): Dispatch {
	return dispatch.parse({
		missionId: MISSION_ID,
		rosterEntryId: LEON_ENTRY,
		agent: AGENTS.leon,
		territory: "Booking",
		briefRef: { moduleId: "M1", requirementIds: ["R1"] },
		status: "queued",
		haltReason: null,
		estimatedTokens: 40_000,
		tokenSoftCeiling: 50_000,
		tokenHardCeiling: 60_000,
		softCeilingCrossed: false,
		tokensUsed: 0,
		tokensIn: 0,
		tokensOut: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		spendUsd: 0,
		wallClockMinutes: 60,
		agentVersionSha256: null,
		agentVersionRef: null,
		skillsSha256: null,
		model: null,
		reportId: null,
		startedAt: null,
		closedAt: null,
		createdAt: ISO,
		updatedAt: ISO,
		...over,
	});
}

const RUNNING = dispatchOf({
	id: RUNNING_ID,
	rosterEntryId: ATLAS_ENTRY,
	agent: AGENTS.atlas,
	status: "running",
	tokensUsed: 12_000,
	tokensIn: 8_000,
	tokensOut: 4_000,
	spendUsd: 1.25,
	agentVersionSha256: hash("a"),
	agentVersionRef: "atlas@v3",
	skillsSha256: hash("b"),
	model: "claude-opus-5-5",
	startedAt: ISO,
});

const QUEUED = dispatchOf({ id: QUEUED_ID });

const DONE = dispatchOf({
	id: DONE_ID,
	status: "complete",
	tokensUsed: 30_000,
	tokensIn: 20_000,
	tokensOut: 10_000,
	spendUsd: 3.5,
	agentVersionSha256: hash("c"),
	agentVersionRef: "leon@v2",
	skillsSha256: hash("d"),
	model: "claude-opus-5-5",
	reportId: REPORT_ID,
	startedAt: ISO,
	closedAt: ISO,
});

const REPORT: CompletionReport = completionReport.parse({
	id: REPORT_ID,
	dispatchId: DONE_ID,
	missionId: MISSION_ID,
	rosterEntryId: LEON_ENTRY,
	status: "complete",
	haltReason: null,
	softCeilingCrossed: false,
	actualTokens: 30_000,
	agentVersionSha256: hash("c"),
	agentVersionRef: "leon@v2",
	skillsSha256: hash("d"),
	versionSource: "recorded",
	model: "claude-opus-5-5",
	artifactsRead: [{ path: "src/contract/booking.ts", sha256: hash("e") }],
	artifactsWritten: [{ path: "src/routes/booking.tsx", sha256: hash("f") }],
	filesTouched: 1,
	fileTypesTouched: ["tsx"],
	rereads: 0,
	blockers: [],
	edgeMismatches: [
		{
			path: "src/contract/booking.ts",
			readSha256: hash("e"),
			writtenSha256: hash("9"),
			producerDispatchId: RUNNING_ID,
		},
	],
	filedBy: "agent",
	createdAt: ISO,
});

function entry(
	id: string,
	name: string,
	slug: string,
	over: Partial<RosterEntry> = {},
): RosterEntry {
	return rosterEntrySchema.parse({
		id,
		missionId: MISSION_ID,
		agentTemplate: {
			id: AGENTS.leon.templateId,
			slug,
			name,
			kind: "feature",
			roles: [],
		},
		active: true,
		waves: ["B"],
		customizedMd: null,
		writablePaths: null,
		territory: "Booking",
		estimatedTokens: 40_000,
		tokenSoftCeiling: 50_000,
		tokenHardCeiling: 60_000,
		grain: "default",
		absorbedBoundaries: [],
		accessOverrides: null,
		createdAt: ISO,
		updatedAt: ISO,
		...over,
	});
}

const LEON = entry(LEON_ENTRY, "Leon", "leon");
const ATLAS = entry(ATLAS_ENTRY, "Atlas", "atlas", {
	territory: null,
	estimatedTokens: null,
	tokenSoftCeiling: null,
	tokenHardCeiling: null,
});

const BRIEF: Brief = {
	summary: "s",
	requirements: [
		{ id: "R1", text: "Book a slot" },
		{ id: "R2", text: "Cancel a booking" },
	],
	acceptanceCriteria: [],
	modules: [{ id: "M1", name: "Booking", requirementIds: ["R1", "R2"] }],
};

function mission(over: Partial<MissionDetail> = {}): MissionDetail {
	return missionDetail.parse({
		id: MISSION_ID,
		origin: "internal",
		type: "template-booking",
		sprintN: 1,
		status: "active",
		cut: "vertical",
		cutSource: "derived",
		client: null,
		engagement: null,
		lastExport: null,
		lastActivityAt: ISO,
		needsYou: null,
		createdAt: ISO,
		updatedAt: ISO,
		brief: {},
		spendCeilingUsd: 50,
		spentUsd: 4.75,
		cutRationale: null,
		repoUrl: "https://github.com/example/app",
		roster: { agents: 2, active: 2 },
		playbook: null,
		recentActivity: [],
		...over,
	});
}

/** A fetcher that records each request, headers included. */
function recording(
	respond: (args: { method: string; path: string }) => {
		status: number;
		body: unknown;
	},
) {
	const calls: {
		method: string;
		path: string;
		headers: Record<string, string>;
	}[] = [];
	const api: ApiFetcher = async (args) => {
		calls.push({ method: args.method, path: args.path, headers: args.headers });
		const { status, body } = respond(args);
		return { status, body, headers: new Headers() };
	};
	return {
		client: createApiClient({ baseUrl: "http://avel.test", api }),
		calls,
	};
}

const page = (data: unknown[], nextCursor: string | null = null) => ({
	status: 200,
	body: { success: true, data, meta: { nextCursor } },
});

// ---------------------------------------------------------------------------

describe("reading a mission's dispatches", () => {
	it("reads every page", async () => {
		const { client, calls } = recording(({ path }) =>
			path.includes("cursor=c2") ? page([DONE]) : page([RUNNING], "c2"),
		);
		const qc = new QueryClient();
		const rows = await qc.fetchQuery(
			missionDispatchesQuery(client, MISSION_ID),
		);
		expect(rows.map((d) => d.id)).toEqual([RUNNING_ID, DONE_ID]);
		expect(calls).toHaveLength(2);
	});

	it("polls while a dispatch is queued or running, then stops", async () => {
		let rows: Dispatch[] = [RUNNING, DONE];
		const { client } = recording(() => page(rows));
		const qc = new QueryClient();
		const options = missionDispatchesQuery(client, MISSION_ID);
		await qc.fetchQuery(options);
		const query = qc.getQueryCache().find({ queryKey: options.queryKey });
		if (!query) throw new Error("no query");
		const interval = () =>
			(options.refetchInterval as unknown as (q: unknown) => number | false)(
				query,
			);
		expect(interval()).toBe(DISPATCH_POLL_MS);

		rows = [{ ...RUNNING, status: "complete" }, DONE];
		await qc.refetchQueries({ queryKey: options.queryKey });
		expect(interval()).toBe(false);

		rows = [dispatchOf({ id: RUNNING_ID }), DONE];
		await qc.refetchQueries({ queryKey: options.queryKey });
		expect(interval()).toBe(DISPATCH_POLL_MS);
	});

	it("sits under the mission's detail key, so a mission refresh reaches it", async () => {
		const qc = seededClient();
		qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), [RUNNING]);
		qc.setQueryData(queryKeys.dispatches.reports(MISSION_ID), [REPORT]);
		await qc.invalidateQueries({ queryKey: missionKeys.detail(MISSION_ID) });
		for (const key of [
			queryKeys.dispatches.list(MISSION_ID),
			queryKeys.dispatches.reports(MISSION_ID),
		])
			expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});
});

describe("the Idempotency-Key", () => {
	const body = bodyOf(initialDraft([LEON], BRIEF.modules));
	let n = 0;
	const fresh = () =>
		`00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

	it("is kept when the same body is sent again, and new for a new body or after a success", () => {
		const first = attemptFor(null, body, fresh);
		expect(attemptFor(first, { ...body }, fresh).key).toBe(first.key);
		const changed = attemptFor(first, { ...body, wallClockMinutes: 90 }, fresh);
		expect(changed.key).not.toBe(first.key);
		// After a success the form clears its last attempt: a new submit.
		expect(attemptFor(null, body, fresh).key).not.toBe(first.key);
	});

	it("goes out on the request, and a retry after a dropped connection reuses it", async () => {
		let drop = true;
		const { client, calls } = recording(() => {
			if (drop) throw new TypeError("fetch failed");
			return {
				status: 201,
				body: { success: true, data: dispatchOf({ id: RUNNING_ID }) },
			};
		});
		const first = attemptFor(null, body, fresh);
		const error = await createDispatchRequest(client, MISSION_ID, first).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(ApiError);
		drop = false;
		const retry = attemptFor(first, body, fresh);
		await createDispatchRequest(client, MISSION_ID, retry);
		expect(calls.map((c) => c.headers["idempotency-key"])).toEqual([
			first.key,
			first.key,
		]);
		expect(calls[0]?.path).toBe(
			`http://avel.test/api/missions/${MISSION_ID}/dispatches`,
		);
	});
});

describe("the New dispatch form", () => {
	it("prefills from the first active agent and the first module", () => {
		expect(initialDraft([LEON, ATLAS], BRIEF.modules)).toEqual({
			rosterEntryId: LEON_ENTRY,
			moduleId: "M1",
			requirementIds: ["R1", "R2"],
			estimatedTokens: "40000",
			tokenSoftCeiling: "50000",
			tokenHardCeiling: "60000",
			wallClockMinutes: "60",
		});
		// No estimate on the entry: blank, so the server's default applies.
		expect(initialDraft([ATLAS], BRIEF.modules).estimatedTokens).toBe("");
	});

	it("checks before sending: the wall clock caps at 480, soft under hard", () => {
		const draft = initialDraft([LEON], BRIEF.modules);
		expect(draftProblems(draft)).toEqual({});
		expect(draftProblems({ ...draft, wallClockMinutes: "481" })).toEqual({
			wallClockMinutes: "At most 480 minutes.",
		});
		expect(draftProblems({ ...draft, estimatedTokens: "1.5" })).toEqual({
			estimatedTokens: "Enter a whole number above zero.",
		});
		expect(
			draftProblems({ ...draft, tokenSoftCeiling: "70000" }).tokenSoftCeiling,
		).toBe("The soft limit can't be above the hard limit.");
		expect(draftProblems({ ...draft, requirementIds: [] })).toEqual({
			requirementIds: "Choose at least one requirement.",
		});
	});

	it("sends blank numbers as absent", () => {
		const draft = initialDraft([ATLAS], BRIEF.modules);
		expect(bodyOf(draft)).toEqual({
			rosterEntryId: ATLAS_ENTRY,
			briefRef: { moduleId: "M1", requirementIds: ["R1", "R2"] },
			wallClockMinutes: 60,
		});
	});

	it("maps each refused body path to its field", () => {
		expect(dispatchFieldOf(["rosterEntryId"])).toBe("rosterEntryId");
		expect(dispatchFieldOf(["briefRef", "moduleId"])).toBe("moduleId");
		expect(dispatchFieldOf(["briefRef", "requirementIds", 1])).toBe(
			"requirementIds",
		);
		expect(dispatchFieldOf(["wallClockMinutes"])).toBe("wallClockMinutes");
		expect(dispatchFieldOf(["tokenHardCeiling"])).toBe("tokenHardCeiling");
		expect(dispatchFieldOf(["other"])).toBeNull();
	});

	const form = (error: ApiError | null) =>
		renderToString(
			<TooltipProvider>
				<InlineModals>
					<NewDispatchForm
						entries={[LEON, ATLAS]}
						brief={BRIEF}
						pending={false}
						error={error}
						onSubmit={() => {}}
					/>
				</InlineModals>
			</TooltipProvider>,
		);

	it("renders the prefilled fields", () => {
		const html = form(null);
		expect(html).toMatch(
			/data-testid="dispatch-new-estimate"[^>]*value="40000"|value="40000"[^>]*data-testid="dispatch-new-estimate"/,
		);
		expect(html).toMatch(
			/data-testid="dispatch-new-minutes"[^>]*value="60"|value="60"[^>]*data-testid="dispatch-new-minutes"/,
		);
		expect(visibleText(html)).toContain("Book a slot");
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("puts a 400's body issues on their fields, in our words", () => {
		const html = form(
			new ApiError({
				method: "POST",
				path: "/api/missions/:id/dispatches",
				kind: "contract",
				status: 400,
				code: "VALIDATION_FAILED",
				message: "for logs",
				requestId: "req_v",
				details: {
					body: [
						{ path: ["wallClockMinutes"], message: "server words" },
						{
							path: ["briefRef", "requirementIds", 0],
							message: "server words",
						},
					],
				},
			}),
		);
		const at = (id: string) =>
			visibleText(html.slice(html.indexOf(`data-testid="${id}"`)));
		expect(at("dispatch-new-minutes-error")).toMatch(
			/^ ?A whole number of minutes, up to 480\./,
		);
		expect(at("dispatch-new-requirements-error")).toMatch(
			/^ ?Choose requirements of that module\./,
		);
		expect(html).not.toContain("server words");
	});

	it("names the agent a 422 is about, under the agent field", () => {
		const error = new ApiError({
			method: "POST",
			path: "/api/missions/:id/dispatches",
			kind: "contract",
			status: 422,
			code: "PRECONDITION_FAILED",
			message: "for logs",
			requestId: "req_p",
			details: {
				reason: "agent_identity_missing",
				rosterEntryIds: [ATLAS_ENTRY],
			},
		});
		expect(refusedAgentsLine(error, [LEON, ATLAS])).toBe(
			"Atlas: no generated identity yet.",
		);
		const html = form(error);
		expect(
			visibleText(
				html.slice(html.indexOf('data-testid="dispatch-new-agent-error"')),
			),
		).toMatch(/^ ?Atlas: no generated identity yet\./);
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("says Sign in to dispatch in the preview, and shows nothing unless active", () => {
		const render = (status: MissionDetail["status"], preview: boolean) =>
			inProviders(
				preview ? (
					<SignedInProvider
						value={{ user: PREVIEW_USER, signOut: async () => {} }}
					>
						<NewDispatch mission={{ id: MISSION_ID, status }} />
					</SignedInProvider>
				) : (
					<NewDispatch mission={{ id: MISSION_ID, status }} />
				),
				seededClient(),
			);
		expect(render("active", true)).toContain("Sign in to dispatch");
		expect(render("halted", false)).not.toContain("dispatch-new-button");
		expect(render("draft", false)).not.toContain("dispatch-new-button");
	});
});

describe("the Dispatches section", () => {
	it("shows once started, or when there are dispatches", () => {
		expect(showsDispatches("draft", [])).toBe(false);
		expect(showsDispatches("draft", undefined)).toBe(false);
		expect(showsDispatches("draft", [RUNNING])).toBe(true);
		expect(showsDispatches("active", [])).toBe(true);
		expect(showsDispatches("halted", undefined)).toBe(true);
	});

	it("opens a closed card onto its report, naming the producer of a mismatch", () => {
		const html = inProviders(
			<DispatchReport
				dispatch={DONE}
				byId={reportsById([REPORT])}
				producers={producersOf([RUNNING, DONE])}
			/>,
			seededClient(),
		);
		const text = visibleText(html);
		expect(html).toContain(`data-testid="completion-report-${DONE_ID}"`);
		expect(text).toMatch(
			/Read src\/contract\/booking\.ts at eeeeeee .*, but Atlas wrote 9999999/,
		);
		expect(text).toContain("30,000 of 40,000 estimated tokens");
		expect(text).not.toMatch(UUID_FRAGMENT);
	});

	async function renderMission(seed: (qc: QueryClient) => void) {
		const qc = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
					retryOnMount: false,
					staleTime: Number.POSITIVE_INFINITY,
				},
			},
		});
		seed(qc);
		const router = createRouter({
			routeTree,
			history: createMemoryHistory({
				initialEntries: [`/missions/${MISSION_ID}`],
			}),
		});
		await router.load();
		return renderToString(
			<SessionSourceProvider source={signedIn()}>
				<ApiOverrideProvider queryClient={qc}>
					<RouterProvider router={router} />
				</ApiOverrideProvider>
			</SessionSourceProvider>,
		);
	}

	const section = (html: string) => {
		const at = html.indexOf('data-testid="mission-section-dispatches"');
		return at === -1 ? null : html.slice(at);
	};

	it("puts the board and New dispatch on an active mission's page, with no visible id", async () => {
		const html = await renderMission((qc) => {
			qc.setQueryData(missionKeys.detail(MISSION_ID).slice(), mission());
			qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), [RUNNING, DONE]);
			qc.setQueryData(queryKeys.dispatches.reports(MISSION_ID), [REPORT]);
		});
		const s = section(html);
		expect(s).not.toBeNull();
		expect(s).toContain('data-testid="dispatch-board"');
		expect(s).toContain(`data-testid="dispatch-card-${RUNNING_ID}"`);
		expect(s).toContain('data-testid="dispatch-new-button"');
		expect(visibleText(s ?? "")).not.toMatch(UUID_FRAGMENT);
		// The spend panel reads the mission's real spend.
		expect(html).toMatch(/data-testid="mission-spend-bar"/);
		expect(visibleText(html)).toContain("$4.75");
	});

	it("offers Start on a queued card and Halt on a running one, and the mission Halt counts the running", async () => {
		const html = await renderMission((qc) => {
			qc.setQueryData(missionKeys.detail(MISSION_ID).slice(), mission());
			qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), [
				QUEUED,
				RUNNING,
				DONE,
			]);
			qc.setQueryData(queryKeys.dispatches.reports(MISSION_ID), [REPORT]);
		});
		const s = section(html) ?? "";
		expect(s).toContain(`data-testid="dispatch-card-start-${QUEUED_ID}"`);
		expect(s).toContain(`data-testid="dispatch-card-halt-${RUNNING_ID}"`);
		expect(s).not.toContain(`dispatch-card-controls-${DONE_ID}`);
		const note = html.slice(html.indexOf('data-testid="mission-halt-note"'));
		expect(visibleText(note)).toMatch(
			/^ ?Halting also stops every running dispatch\. 1 is running now\./,
		);
	});

	it("offers neither Start nor Halt on a halted mission's cards", async () => {
		const html = await renderMission((qc) => {
			qc.setQueryData(
				missionKeys.detail(MISSION_ID).slice(),
				mission({ status: "halted" }),
			);
			qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), [QUEUED, DONE]);
			qc.setQueryData(queryKeys.dispatches.reports(MISSION_ID), [REPORT]);
		});
		const s = section(html) ?? "";
		expect(s).toContain(`data-testid="dispatch-card-${QUEUED_ID}"`);
		expect(s).not.toContain("dispatch-card-controls-");
		expect(html).not.toContain("mission-halt-note");
	});

	it("leaves a draft with no dispatches without the section", async () => {
		const html = await renderMission((qc) => {
			qc.setQueryData(
				missionKeys.detail(MISSION_ID).slice(),
				mission({ status: "draft" }),
			);
			qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), []);
		});
		expect(section(html)).toBeNull();
	});

	it("says no dispatch ran on a halted mission without any, and offers no New dispatch", async () => {
		const html = await renderMission((qc) => {
			qc.setQueryData(
				missionKeys.detail(MISSION_ID).slice(),
				mission({ status: "halted" }),
			);
			qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), []);
		});
		const s = section(html) ?? "";
		expect(s).toContain('data-testid="mission-dispatches-empty"');
		expect(visibleText(s)).toContain("No dispatch ran on this mission.");
		expect(s).not.toContain("dispatch-new-button");
	});
});

describe("starting and halting a dispatch", () => {
	const ok = (data: Dispatch) => ({
		status: 200,
		body: { success: true, data },
	});

	it("start and halt post to the dispatch's own routes", async () => {
		const { client, calls } = recording(({ path }) =>
			path.endsWith("/start")
				? ok(dispatchOf({ id: QUEUED_ID, status: "running", startedAt: ISO }))
				: ok(RUNNING),
		);
		const started = await startDispatchRequest(client, QUEUED_ID);
		await haltDispatchRequest(client, RUNNING_ID);
		expect(started.status).toBe("running");
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			`POST http://avel.test/api/dispatches/${QUEUED_ID}/start`,
			`POST http://avel.test/api/dispatches/${RUNNING_ID}/halt`,
		]);
	});

	it("a move refreshes the mission (its dispatches and reports), the dispatch and the log", async () => {
		const qc = seededClient();
		qc.setQueryData(missionKeys.detail(MISSION_ID).slice(), mission());
		qc.setQueryData(queryKeys.dispatches.list(MISSION_ID), [RUNNING]);
		qc.setQueryData(queryKeys.dispatches.reports(MISSION_ID), []);
		qc.setQueryData(queryKeys.dispatches.detail(RUNNING_ID), RUNNING);
		qc.setQueryData(queryKeys.dispatches.detail(DONE_ID), DONE);
		qc.setQueryData(queryKeys.activity.all(), {});
		qc.setQueryData(queryKeys.roster.list(MISSION_ID), [LEON]);
		await afterDispatchMoved(qc, MISSION_ID, RUNNING_ID);
		const stale = (key: readonly unknown[]) =>
			qc.getQueryState(key)?.isInvalidated;
		expect(stale(missionKeys.detail(MISSION_ID))).toBe(true);
		expect(stale(queryKeys.dispatches.list(MISSION_ID))).toBe(true);
		expect(stale(queryKeys.dispatches.reports(MISSION_ID))).toBe(true);
		expect(stale(queryKeys.dispatches.detail(RUNNING_ID))).toBe(true);
		expect(stale(queryKeys.activity.all())).toBe(true);
		expect(stale(queryKeys.dispatches.detail(DONE_ID))).toBe(false);
		expect(stale(queryKeys.roster.list(MISSION_ID))).toBe(false);
	});

	const refusal = (reason: string, extra: Record<string, unknown> = {}) =>
		new ApiError({
			method: "POST",
			path: "/api/dispatches/:id/start",
			kind: "contract",
			status: 422,
			code: "PRECONDITION_FAILED",
			message: "for logs",
			requestId: "req_s",
			details: { reason, dispatchId: QUEUED_ID, ...extra },
		} as ConstructorParameters<typeof ApiError>[0]);

	const card = (
		d: Dispatch,
		controls: Partial<Parameters<typeof DispatchControls>[0]> = {},
	) =>
		inProviders(
			<DispatchCard
				dispatch={d}
				now={Date.parse(ISO)}
				renderControls={(x) => (
					<DispatchControls
						dispatch={x}
						onStart={() => {}}
						onHalt={() => {}}
						{...controls}
					/>
				)}
			/>,
			seededClient(),
		);

	/** The card's refusal, as visible text. */
	const refusalText = (html: string, id: string) => {
		const at = html.indexOf(`data-testid="dispatch-card-error-${id}"`);
		// renderToString escapes apostrophes; the copy is read as typed.
		return at === -1
			? null
			: visibleText(html.slice(at)).replaceAll("&#x27;", "'");
	};

	it("puts a refused Start's copy on its card, naming the model with no price", () => {
		const html = card(QUEUED, {
			error: refusal("model_price_unknown", { model: "claude-opus-5-5" }),
		});
		const text = refusalText(html, QUEUED_ID) ?? "";
		expect(text).toMatch(
			/^ ?AVEL has no price for this model, so it can't hold the run to the spend limit\. ?The model with no price is claude-opus-5-5\./,
		);
		expect(text).not.toContain("for logs");
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("names the card's agent where a refusal names roster entries, never by id", () => {
		const html = card(QUEUED, {
			error: refusal("roster_entry_inactive", { rosterEntryIds: [LEON_ENTRY] }),
		});
		expect(refusalText(html, QUEUED_ID)).toMatch(
			/^ ?That agent isn't active on this mission's roster\. ?Leon: not active on the roster\./,
		);
		expect(
			dispatchRefusalLine(
				refusal("agent_identity_missing", { rosterEntryIds: [LEON_ENTRY] }),
				QUEUED,
			),
		).toBe("Leon: no generated identity yet.");
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("words every Start refusal in our copy, with no extra line where the copy says it all", () => {
		const copy = {
			dispatch_not_queued: "This dispatch has already started or ended.",
			mission_not_active: "This mission isn't running.",
			spend_ceiling_reached: "This mission has reached its spend limit.",
			harness_unavailable: "The agent runner can't take this agent right now.",
		};
		for (const [reason, what] of Object.entries(copy)) {
			const error = refusal(reason);
			expect(dispatchRefusalLine(error, QUEUED)).toBeNull();
			expect(refusalText(card(QUEUED, { error }), QUEUED_ID)).toContain(what);
		}
	});

	it("puts a refused Halt on the running card: dispatch_not_running", () => {
		const html = card(RUNNING, { error: refusal("dispatch_not_running") });
		expect(refusalText(html, RUNNING_ID)).toMatch(
			/^ ?This dispatch isn't running\. ?Reload to see where it stands\. Only a running dispatch can be halted\./,
		);
	});

	it("holds Halt to confirm, and shows nothing on a closed card", () => {
		const running = card(RUNNING);
		expect(running).toContain(`data-testid="dispatch-card-halt-${RUNNING_ID}"`);
		expect(visibleText(running)).toContain("Hold to halt");
		expect(running).not.toContain(`dispatch-card-start-${RUNNING_ID}`);
		expect(card(DONE)).not.toContain("dispatch-card-controls-");
		expect(card(QUEUED, { pending: "start" })).toContain("Starting");
		expect(card(RUNNING, { pending: "halt" })).toContain("Halting");
	});

	it("says Sign in to start and Sign in to halt in the preview", () => {
		const preview = (d: Dispatch) =>
			inProviders(
				<SignedInProvider
					value={{ user: PREVIEW_USER, signOut: async () => {} }}
				>
					<DispatchControls dispatch={d} onStart={() => {}} onHalt={() => {}} />
				</SignedInProvider>,
				seededClient(),
			);
		expect(preview(QUEUED)).toContain("Sign in to start");
		expect(preview(RUNNING)).toContain("Sign in to halt");
		expect(card(QUEUED)).not.toContain("Sign in to");
	});
});

describe("the mission Halt's note", () => {
	it("says it stops every running dispatch, and how many run now", () => {
		const all = "Halting also stops every running dispatch.";
		expect(haltNote(undefined)).toBe(all);
		expect(haltNote(0)).toBe(`${all} None is running now.`);
		expect(haltNote(1)).toBe(`${all} 1 is running now.`);
		expect(haltNote(3)).toBe(`${all} 3 are running now.`);
	});
});
