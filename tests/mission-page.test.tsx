import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	EXPORT_STATUSES,
	type MissionDetail,
	missionDetail,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { missionKeys } from "@/components/avel/mission-data";
import {
	DELIVERY_STAGES,
	deliveryStages,
	nowBanner,
	shortDuration,
} from "@/components/avel/mission-page";
import {
	MISSING_ROUTE,
	sampleExports,
	sampleHaltReason,
	sampleSpend,
	sampleStages,
	sampleTeam,
} from "@/components/avel/mission-placeholders";
import { ApiError, ApiOverrideProvider } from "@/lib/api";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schema.

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const ID = "0a1b2c3d-0000-4000-8000-000000000001";

function detail(extra: Partial<MissionDetail> = {}): MissionDetail {
	return missionDetail.parse({
		id: ID,
		origin: "client",
		type: "template-booking",
		sprintN: 3,
		status: "active",
		cut: "vertical",
		cutSource: "derived",
		client: { id: "00000000-0000-4000-8000-000000000901", name: "Meridian" },
		engagement: {
			id: "00000000-0000-4000-8000-000000000801",
			name: "Booking",
		},
		lastExport: null,
		lastActivityAt: "2026-10-06T09:00:00.000Z",
		needsYou: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		brief: { goal: "Ship the booking flow" },
		spendCeilingUsd: 120,
		cutRationale: null,
		repoUrl: "https://github.com/example/app",
		roster: { agents: 4, active: 2 },
		playbook: { missionType: "template-booking", name: "Template booking" },
		recentActivity: [
			{
				action: "mission.updated",
				entityType: "mission",
				at: "2026-10-06T07:00:00.000Z",
				actor: { kind: "operator", userId: null, display: "ada" },
			},
		],
		...extra,
	});
}

const exported = (
	status: (typeof EXPORT_STATUSES)[number],
	changed = "2026-10-06T10:00:00.000Z",
) => ({
	id: "00000000-0000-4000-8000-000000000501",
	status,
	targetKind: "github_pr" as const,
	createdAt: "2026-10-06T08:00:00.000Z",
	statusChangedAt: changed,
	gates: null,
});

async function render(
	path: string,
	seed: (client: QueryClient) => void,
): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	seed(queryClient);
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

const withMission =
	(mission: MissionDetail) =>
	(client: QueryClient): void => {
		client.setQueryData(missionKeys.detail(mission.id).slice(), mission);
	};

/** One element by test id, from its opening tag to its matching close. */
function element(html: string, testid: string): string {
	const start = html.lastIndexOf("<", html.indexOf(`data-testid="${testid}"`));
	expect(html.indexOf(`data-testid="${testid}"`), testid).toBeGreaterThan(-1);
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed ${testid}`);
}

const pills = (html: string) =>
	html.match(/data-testid="sample-data"/g)?.length ?? 0;

// ---------------------------------------------------------------------------

describe("the route", () => {
	it("titles the tab by the short id, and crumbs back to Missions", async () => {
		const html = await render(`/missions/${ID}`, withMission(detail()));
		expect(html).toContain("<title>0a1b2c3d · Missions · AVEL</title>");
		const crumbs = element(html, "breadcrumbs");
		expect(crumbs).toContain('href="/missions"');
		expect(crumbs).toContain(">Missions<");
	});

	it("is opened from the details panel", async () => {
		const html = await render(`/missions?mission=${ID}`, withMission(detail()));
		expect(tagOf(html, "mission-details-full-page")).toContain(
			`href="/missions/${ID}"`,
		);
	});

	it("says a missing mission is gone, with a way back", async () => {
		const html = await render(`/missions/${ID}`, (client) => {
			client.setQueryData(missionKeys.detail(ID).slice(), undefined);
			const query = client
				.getQueryCache()
				.build(client, { queryKey: missionKeys.detail(ID).slice() });
			query.setState({
				status: "error",
				error: new ApiError({
					method: "GET",
					path: "/api/missions/:id",
					kind: "contract",
					status: 404,
					code: "NOT_FOUND",
					message: "Mission not found",
					requestId: "req-1",
				}),
			});
		});
		expect(html).toContain('data-testid="mission-page-back"');
		expect(html).not.toContain('data-testid="mission-page-content"');
	});
});

describe("the page from the contract", () => {
	it("shows the id with a copy button, status, client and engagement", async () => {
		const header = element(
			await render(`/missions/${ID}`, withMission(detail())),
			"mission-page-header",
		);
		expect(header).toContain(ID);
		expect(header).toContain('data-testid="mission-page-copy-id"');
		expect(header).toContain("Meridian");
		expect(header).toContain("Booking");
		expect(header).toContain(">template-booking<");
	});

	it("shows the repository, cut, playbook, brief and activity", async () => {
		const html = await render(`/missions/${ID}`, withMission(detail()));
		expect(element(html, "mission-section-repository")).toContain(
			'href="https://github.com/example/app"',
		);
		expect(element(html, "mission-section-playbook-page")).toContain(
			"Template booking",
		);
		expect(element(html, "mission-section-brief-page")).toContain(
			"Ship the booking flow",
		);
		expect(element(html, "mission-section-activity-page")).toContain("ada");
		expect(tagOf(html, "mission-activity-full-log")).toMatch(/disabled/);
	});

	it("shows a brief in the contract's shape by requirement, as the side panel does", async () => {
		const html = await render(
			`/missions/${ID}`,
			withMission(
				detail({
					brief: {
						summary: "A booking flow.",
						requirements: [{ id: "R1", text: "Patients book a slot." }],
						acceptanceCriteria: [
							{ id: "AC1", requirementId: "R1", text: "A free slot books." },
						],
					},
				}),
			),
		);
		const brief = element(html, "mission-section-brief-page");
		expect(brief).toContain('data-shape="plan"');
		expect(element(brief, "mission-brief-requirement-R1")).toContain(
			"A free slot books.",
		);
	});

	it("counts the team from the roster, and the ceiling from the mission", async () => {
		const html = await render(`/missions/${ID}`, withMission(detail()));
		expect(
			element(html, "mission-section-team").replaceAll("<!-- -->", ""),
		).toMatch(/>4<\/span> agents,.*>2<\/span> active/s);
		expect(element(html, "mission-section-spend-page")).toContain("$120.00");
	});
});

describe("sample data (ruling 29)", () => {
	const SAMPLE_REGIONS = [
		"mission-progress-early",
		"mission-exports-earlier",
		"mission-team-entries",
		"mission-spend-meter",
	];
	const REAL_REGIONS = [
		"mission-page-header",
		"mission-progress-delivery",
		"mission-export-latest",
		"mission-section-activity-page",
		"mission-section-repository",
		"mission-section-playbook-page",
		"mission-section-brief-page",
	];

	it("labels every sample region, once, and no real one", async () => {
		const html = await render(
			`/missions/${ID}`,
			withMission(detail({ lastExport: exported("verifying") })),
		);
		for (const id of SAMPLE_REGIONS) {
			expect(pills(element(html, id)), id).toBe(1);
		}
		for (const id of REAL_REGIONS) {
			expect(pills(element(html, id)), id).toBe(0);
		}
		// Nowhere else: every pill on the page is one of the above.
		expect(pills(html)).toBe(SAMPLE_REGIONS.length);
	});

	it("labels the halt reason apart from the real halted state", async () => {
		const html = await render(
			`/missions/${ID}`,
			withMission(detail({ status: "halted" })),
		);
		const now = element(html, "mission-now");
		expect(now).toContain("This mission is halted.");
		expect(pills(element(html, "mission-now-halt-reason"))).toBe(1);
		expect(element(html, "mission-now-halt-reason")).toContain(
			sampleHaltReason(ID),
		);
	});

	it("names the missing route on each pill", async () => {
		const html = await render(`/missions/${ID}`, withMission(detail()));
		const missing = [
			...html.matchAll(/data-testid="sample-data" data-missing="([^"]+)"/g),
		].map((m) => m[1]);
		expect(new Set(missing)).toEqual(
			new Set([
				MISSING_ROUTE.stages,
				MISSING_ROUTE.exports,
				MISSING_ROUTE.team,
				MISSING_ROUTE.spend,
			]),
		);
		expect(html).toContain(
			`placeholder until avel-server has ${MISSING_ROUTE.exports}`,
		);
	});

	it("gives one mission the same samples every time", () => {
		expect(sampleExports(ID)).toEqual(sampleExports(ID));
		expect(sampleTeam(ID, 4, 2)).toEqual(sampleTeam(ID, 4, 2));
		expect(sampleSpend(ID, 120)).toBe(sampleSpend(ID, 120));
		expect(sampleHaltReason(ID)).toBe(sampleHaltReason(ID));
		const other = "0a1b2c3d-0000-4000-8000-000000000002";
		expect(
			JSON.stringify([sampleExports(other), sampleSpend(other, 120)]),
		).not.toBe(JSON.stringify([sampleExports(ID), sampleSpend(ID, 120)]));
	});

	it("keeps samples inside the real counts and ceiling", () => {
		const team = sampleTeam(ID, 4, 2);
		expect(team).toHaveLength(4);
		expect(team.filter((t) => t.active)).toHaveLength(2);
		expect(sampleTeam(ID, 0, 0)).toEqual([]);
		for (let n = 0; n < 50; n++) {
			const spent = sampleSpend(`${ID}-${n}`, 120);
			expect(spent).toBeGreaterThan(0);
			expect(spent).toBeLessThan(120);
		}
	});

	it("puts every early stage behind a mission that has an export", () => {
		expect(sampleStages(ID, true)).toEqual({
			plan: "done",
			assemble: "done",
			execute: "done",
		});
		const early = Object.values(sampleStages(ID, false));
		expect(early.filter((s) => s === "current")).toHaveLength(1);
	});
});

describe("the Now banner", () => {
	it("puts the operator's turn first, even on a halted mission", () => {
		expect(
			nowBanner(
				detail({ status: "halted", needsYou: { reason: "export_previewed" } }),
				NOW,
			),
		).toEqual({
			kind: "needs-you",
			text: "Preview ready for your approval",
		});
	});

	it("then a halt, then a delivery moving, then quiet", () => {
		expect(nowBanner(detail({ status: "halted" }), NOW)?.kind).toBe("halted");
		expect(
			nowBanner(detail({ lastExport: exported("verifying") }), NOW),
		).toEqual({ kind: "in-flight", text: "Verifying for 2h" });
		expect(
			nowBanner(detail({ lastActivityAt: "2026-10-01T12:00:00.000Z" }), NOW),
		).toEqual({ kind: "quiet", text: "No activity for 5 days" });
	});

	it("says nothing when nothing needs saying", () => {
		expect(nowBanner(detail(), NOW)).toBeNull();
		expect(nowBanner(detail({ lastExport: exported("done") }), NOW)).toBeNull();
	});
});

describe("the progress track", () => {
	it("reads Verify and Ship from the real last export", () => {
		expect(deliveryStages(undefined)).toEqual({
			verify: "not-started",
			ship: "not-started",
		});
		expect(deliveryStages("previewed")).toEqual({
			verify: "waiting-on-you",
			ship: "not-started",
		});
		expect(deliveryStages("pr-open")).toEqual({
			verify: "done",
			ship: "waiting-on-you",
		});
		expect(deliveryStages("done")).toEqual({ verify: "done", ship: "done" });
		expect(deliveryStages("failed").verify).toBe("failed");
	});

	it("places every export status the contract has", () => {
		expect(Object.keys(DELIVERY_STAGES).sort()).toEqual(
			[...EXPORT_STATUSES].sort(),
		);
	});

	it("renders the real stages from the export", async () => {
		const html = await render(
			`/missions/${ID}`,
			withMission(detail({ lastExport: exported("pr-open") })),
		);
		expect(tagOf(html, "mission-stage-verify")).toContain('data-state="done"');
		expect(tagOf(html, "mission-stage-ship")).toContain(
			'data-state="waiting-on-you"',
		);
	});
});

describe("short durations", () => {
	it("reads minutes, hours, then days", () => {
		expect(shortDuration(45 * 60_000)).toBe("45m");
		expect(shortDuration(2 * 3_600_000)).toBe("2h");
		expect(shortDuration(47 * 3_600_000)).toBe("47h");
		expect(shortDuration(72 * 3_600_000)).toBe("3d");
		expect(shortDuration(-5)).toBe("0m");
	});
});
