import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type MissionDetail,
	type MissionReadiness,
	missionDetail,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError, ApiOverrideProvider, queryKeys } from "@/lib/api";
import {
	afterStatusChange,
	haltMissionRequest,
	startMissionRequest,
} from "@/lib/api/mission-lifecycle";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { fakeApi } from "./clients-fixtures";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

const ID = "0a1b2c3d-0000-4000-8000-000000000001";
const ENTRY_ID = "0a1b2c3d-0000-4000-8000-000000000101";
const ISO = "2026-10-06T09:00:00.000Z";

function detail(extra: Partial<MissionDetail> = {}): MissionDetail {
	return missionDetail.parse({
		gateRunning: false,
		activeGateJob: null,
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
		lastActivityAt: ISO,
		needsYou: null,
		createdAt: ISO,
		updatedAt: ISO,
		brief: {},
		spendCeilingUsd: null,
		spentUsd: 0,
		cutRationale: null,
		repoUrl: "https://github.com/example/app",
		roster: { agents: 1, active: 1 },
		playbook: null,
		recentActivity: [],
		...extra,
	});
}

const ENTRY: RosterEntry = rosterEntrySchema.parse({
	id: ENTRY_ID,
	missionId: ID,
	agentTemplate: {
		id: "0a1b2c3d-0000-4000-8000-000000000201",
		slug: "leon",
		name: "Leon",
		kind: "feature",
		roles: [],
	},
	active: true,
	waves: ["B"],
	customizedMd: null,
	writablePaths: null,
	territory: "Booking",
	estimatedTokens: null,
	tokenSoftCeiling: null,
	tokenHardCeiling: null,
	grain: "default",
	absorbedBoundaries: [],
	accessOverrides: null,
	createdAt: ISO,
	updatedAt: ISO,
});

const NOT_READY: MissionReadiness = {
	missionId: ID,
	ready: false,
	blockers: [
		{
			reason: "estimate_missing",
			rosterEntryIds: [ENTRY_ID],
			issues: [
				{ path: ["roster", ENTRY_ID, "estimatedTokens"], message: "for logs" },
			],
		},
	],
	warnings: [{ reason: "spend_ceiling_missing" }],
};

function seeded(seed: (client: QueryClient) => void): QueryClient {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	seed(client);
	return client;
}

async function renderMission(queryClient: QueryClient): Promise<string> {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [`/missions/${ID}`] }),
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

/** The header plate, to its end, as visible text. */
function header(html: string): string {
	const at = html.indexOf('data-testid="mission-page-header"');
	expect(at).toBeGreaterThan(-1);
	const end = html.indexOf("</header>", at);
	return html.slice(at, end);
}

const DISABLED =
	/data-testid="mission-start-button"[^>]*disabled=""|disabled=""[^>]*data-testid="mission-start-button"/;

describe("the mission page header", () => {
	it("a draft lists what stops it starting, naming agents from the cached roster", async () => {
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
				c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
				c.setQueryData(queryKeys.roster.list(ID), [ENTRY]);
			}),
		);
		const h = header(html);
		expect(h).toContain('data-testid="mission-start"');
		expect(h).toMatch(DISABLED);
		expect(h).toContain('data-reason="estimate_missing"');
		expect(h).toContain(
			'data-testid="mission-readiness-warning-spend_ceiling_missing"',
		);
		expect(visibleText(h)).toContain("Leon, Booking has no token estimate.");
		expect(visibleText(h)).not.toMatch(UUID_FRAGMENT);
		expect(h).not.toContain("for logs");
	});

	it("while the roster loads, the agent is unnamed but still on it", async () => {
		// Unseeded, the roster read is pending on the server: the loading state.
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
				c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
			}),
		);
		const text = visibleText(header(html));
		expect(text).toContain("An agent on the roster has no token estimate.");
		expect(text).not.toMatch(UUID_FRAGMENT);
	});

	it("when the roster read fails, the same fallback stands", async () => {
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
				c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
				c.getQueryCache()
					.build(c, { queryKey: queryKeys.roster.list(ID) })
					.setState({
						status: "error",
						fetchStatus: "idle",
						error: new ApiError({
							method: "GET",
							path: `/api/missions/${ID}/roster`,
							kind: "unreachable",
						}),
					});
			}),
		);
		expect(visibleText(header(html))).toContain(
			"An agent on the roster has no token estimate.",
		);
	});

	it("a roster without the entry says the agent has left it", async () => {
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
				c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
				c.setQueryData(queryKeys.roster.list(ID), []);
			}),
		);
		expect(visibleText(header(html))).toContain(
			"An agent no longer on the roster has no token estimate.",
		);
	});

	it("a ready draft enables Start", async () => {
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
				c.setQueryData(queryKeys.missionLifecycle.readiness(ID), {
					missionId: ID,
					ready: true,
					blockers: [],
					warnings: [],
				});
			}),
		);
		const h = header(html);
		expect(h).toContain('data-testid="mission-readiness-clear"');
		expect(h).toContain('data-testid="mission-start-button"');
		expect(h).not.toMatch(DISABLED);
	});

	it("an active mission offers Halt in the header", async () => {
		const html = await renderMission(
			seeded((c) => {
				c.setQueryData(
					queryKeys.missions.detail(ID).slice(),
					detail({ status: "active" }),
				);
			}),
		);
		const h = header(html);
		expect(h).toContain('data-testid="mission-halt-button"');
		expect(h).not.toContain('data-testid="mission-start"');
	});

	it("reads readiness for a draft only, and the roster for Start or New dispatch", async () => {
		/** Whether each read is switched on, as the page's queries left them. */
		const reads = async (status: MissionDetail["status"]) => {
			// No agents counted, so the Team panel (which reads the roster
			// whenever there is one) stays out of what this test measures.
			const client = seeded((c) => {
				c.setQueryData(
					queryKeys.missions.detail(ID).slice(),
					detail({ status, roster: { agents: 0, active: 0 } }),
				);
			});
			await renderMission(client);
			const enabled = (key: readonly unknown[]) =>
				(
					client.getQueryCache().find({ queryKey: key, exact: true })
						?.options as { enabled?: unknown } | undefined
				)?.enabled;
			return {
				roster: enabled(queryKeys.roster.list(ID)),
				readiness: enabled(queryKeys.missionLifecycle.readiness(ID)),
			};
		};
		expect(await reads("draft")).toEqual({ roster: true, readiness: true });
		// Halted: no Start, and no New dispatch (which reads the roster for
		// an active mission's form).
		expect(await reads("halted")).toEqual({ roster: false, readiness: false });
		expect((await reads("active")).readiness).toBe(false);
	});
});

describe("the lifecycle requests", () => {
	it("start posts to the mission's start route and answers the status change", async () => {
		const change = { missionId: ID, from: "draft", to: "active", at: ISO };
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: change },
		}));
		await expect(startMissionRequest(client, ID)).resolves.toEqual(change);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			`POST http://avel.test/api/missions/${ID}/start`,
		]);
	});

	it("a refused start rejects with its blocker's details", async () => {
		const { client } = fakeApi(() => ({
			status: 422,
			body: {
				success: false,
				error: {
					code: "PRECONDITION_FAILED",
					message: "for logs",
					requestId: "req_start",
					details: {
						reason: "estimate_missing",
						missionId: ID,
						rosterEntryIds: [ENTRY_ID],
					},
				},
			},
		}));
		const error = await startMissionRequest(client, ID).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		const { failure } = error as ApiError;
		expect(failure.kind === "contract" && failure.code).toBe(
			"PRECONDITION_FAILED",
		);
	});

	it("halt posts to the mission's halt route", async () => {
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: {
				success: true,
				data: { missionId: ID, from: "active", to: "halted", at: ISO },
			},
		}));
		await haltMissionRequest(client, ID);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			`POST http://avel.test/api/missions/${ID}/halt`,
		]);
	});
});

describe("after a status change", () => {
	it("the mission, its readiness, the lists and the activity read again", async () => {
		const client = seeded((c) => {
			c.setQueryData(queryKeys.missions.detail(ID).slice(), detail());
			c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
			c.setQueryData(["missions", "list", { origin: "internal" }], {});
			c.setQueryData(queryKeys.activity.all(), {});
			c.setQueryData(queryKeys.catalog.agentTemplatesAll(), {});
		});
		await afterStatusChange(client);
		const stale = (key: readonly unknown[]) =>
			client.getQueryState(key)?.isInvalidated;
		expect(stale(queryKeys.missions.detail(ID))).toBe(true);
		expect(stale(queryKeys.missionLifecycle.readiness(ID))).toBe(true);
		expect(stale(["missions", "list", { origin: "internal" }])).toBe(true);
		expect(stale(queryKeys.activity.all())).toBe(true);
		expect(stale(queryKeys.catalog.agentTemplatesAll())).toBe(false);
	});

	it("readiness sits under the mission's detail, so a plan or roster write refreshes it", async () => {
		const client = seeded((c) => {
			c.setQueryData(queryKeys.missionLifecycle.readiness(ID), NOT_READY);
		});
		await client.invalidateQueries({ queryKey: queryKeys.missions.detail(ID) });
		expect(
			client.getQueryState(queryKeys.missionLifecycle.readiness(ID))
				?.isInvalidated,
		).toBe(true);
	});
});
