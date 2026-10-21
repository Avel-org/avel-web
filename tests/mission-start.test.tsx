import {
	type Brief,
	type PreconditionDetails,
	READINESS_REASONS,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
	blockerDetails,
	type MissionReadiness,
	MissionStart,
	planIssueText,
	READINESS_CHECK_LABEL,
	READINESS_WARNING_TEXT,
	type ReadinessBlocker,
	Refusal,
	refusedBlocker,
	startBlockedReason,
} from "@/components/avel/mission-start";
import type { SurfaceQuery } from "@/components/avel/surface";
import { ApiError } from "@/lib/api/errors";
import { waveTitle } from "@/lib/api/roster";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { PREVIEW_USER, SignedInProvider } from "@/shell/auth-gate";
import { catalogSeed, inProviders, seededClient } from "./catalog-fixtures";
import { tagOf } from "./render-page";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

const MISSION_ID = "66666666-6666-4666-8666-666666666666";
const ISO = "2026-10-13T12:00:00.000Z";
const ATLAS_ENTRY_ID = "77777777-7777-4777-8777-777777777777";
const LEON_ENTRY_ID = "88888888-8888-4888-8888-888888888888";
const GONE_ENTRY_ID = "99999999-9999-4999-8999-999999999999";
const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function entry(
	id: string,
	name: string,
	slug: string,
	territory: string | null,
): RosterEntry {
	return rosterEntrySchema.parse({
		id,
		missionId: MISSION_ID,
		agentTemplate: {
			id: "11111111-1111-4111-8111-111111111111",
			slug,
			name,
			kind: "feature",
			roles: [],
		},
		active: true,
		waves: ["A"],
		customizedMd: null,
		writablePaths: null,
		territory,
		estimatedTokens: null,
		tokenSoftCeiling: null,
		tokenHardCeiling: null,
		grain: "default",
		absorbedBoundaries: [],
		accessOverrides: null,
		createdAt: ISO,
		updatedAt: ISO,
	});
}

const ROSTER = [
	entry(ATLAS_ENTRY_ID, "Atlas", "atlas", "Booking"),
	entry(LEON_ENTRY_ID, "Leon", "leon", null),
];

const BRIEF: Brief = {
	summary: "s",
	requirements: [
		{ id: "R1", text: "one" },
		{ id: "R2", text: "two" },
	],
	acceptanceCriteria: [],
	modules: [{ id: "M1", name: "Booking", reads: [], requirementIds: ["R1"] }],
	checks: [],
};

/** All six checks failing, in the server's order. */
const ALL_FAILING: ReadinessBlocker[] = [
	{ reason: "mission_not_draft" },
	{ reason: "engagement_closed", engagementId: GONE_ENTRY_ID },
	{
		reason: "plan_check_failed",
		issues: [
			{ path: ["brief", "requirements", 1], message: "R2 is in no module" },
			{ path: ["brief", "modules", 0, "id"], message: "server words" },
		],
	},
	{
		reason: "coherence_blocked",
		wave: "A",
		issues: [{ path: ["coherence", "block"], message: "server words" }],
	},
	{
		reason: "estimate_missing",
		rosterEntryIds: [ATLAS_ENTRY_ID, LEON_ENTRY_ID],
		issues: [
			{
				path: ["roster", ATLAS_ENTRY_ID, "estimatedTokens"],
				message: "server words",
			},
			{
				path: ["roster", LEON_ENTRY_ID, "estimatedTokens"],
				message: "server words",
			},
		],
	},
];

const ready = (
	data: MissionReadiness,
): SurfaceQuery<MissionReadiness, ApiError> => ({ status: "success", data });

const NOT_READY = ready({
	missionId: MISSION_ID,
	ready: false,
	blockers: ALL_FAILING,
	warnings: [],
});
const READY = ready({
	missionId: MISSION_ID,
	ready: true,
	blockers: [],
	warnings: [],
});

const never = () => new Promise<never>(() => {});

function refusal(details: PreconditionDetails): ApiError {
	return new ApiError({
		kind: "contract",
		status: 422,
		code: "PRECONDITION_FAILED",
		message: "server message, never shown",
		details,
		requestId: "req_start",
		method: "POST",
		path: `/api/missions/${MISSION_ID}/start`,
	});
}

function render(node: ReactNode, preview = false) {
	const wrapped = preview ? (
		<SignedInProvider value={{ user: PREVIEW_USER, signOut: async () => {} }}>
			{node}
		</SignedInProvider>
	) : (
		node
	);
	return inProviders(wrapped, seededClient(catalogSeed()));
}

const region = (html: string, testId: string) => {
	const at = html.indexOf(`data-testid="${testId}"`);
	expect(at, testId).toBeGreaterThan(-1);
	return visibleText(html.slice(at));
};

// ---------------------------------------------------------------------------

describe("planIssueText", () => {
	it("words each checkPlan path, naming items from the brief", () => {
		expect(planIssueText(["brief", "modules"], BRIEF)).toBe(
			"The plan has no modules.",
		);
		expect(planIssueText(["brief", "modules", 0, "id"], BRIEF)).toBe(
			"Module M1 has an id another module also uses.",
		);
		expect(
			planIssueText(["brief", "modules", 0, "requirementIds", 0], BRIEF),
		).toBe(
			"Module M1 lists a requirement that isn't in the plan, or lists one twice.",
		);
		expect(planIssueText(["brief", "requirements", 1], BRIEF)).toBe(
			"Requirement R2 must be in exactly one module.",
		);
		expect(
			planIssueText(["brief", "requirements", 1, "acceptanceCriteria"], BRIEF),
		).toBe("Requirement R2 has no acceptance criterion.");
	});

	it("says which part of the plan is missing or empty, or that there is no plan", () => {
		expect(planIssueText(["brief", "requirements"], null)).toBe(
			"The plan has no requirements.",
		);
		expect(planIssueText(["brief", "acceptanceCriteria"], null)).toBe(
			"The plan has no acceptance criteria.",
		);
		expect(planIssueText(["brief", "summary"], null)).toBe(
			"The plan has no summary.",
		);
		expect(planIssueText(["brief"], null)).toBe("The mission has no plan yet.");
	});

	it("falls back to position without the brief, and to a plain line for the unknown", () => {
		expect(planIssueText(["brief", "requirements", 1], null)).toBe(
			"Requirement 2 must be in exactly one module.",
		);
		expect(planIssueText(["brief", "goal"], BRIEF)).toBe(
			"The plan has an issue to fix.",
		);
		// A requirement's own field is a shape issue, not its module.
		expect(planIssueText(["brief", "requirements", 0, "text"], BRIEF)).toBe(
			"The plan has an issue to fix.",
		);
	});
});

describe("blockerDetails", () => {
	it("names agents missing an estimate from the roster, never by id", () => {
		const lines = blockerDetails(
			{
				reason: "estimate_missing",
				rosterEntryIds: [ATLAS_ENTRY_ID, LEON_ENTRY_ID, GONE_ENTRY_ID],
			},
			{ roster: ROSTER },
		);
		expect(lines.map((l) => l.text)).toEqual([
			"Atlas · Booking has no token estimate.",
			"Leon has no token estimate.",
			"An agent no longer on the roster has no token estimate.",
		]);
		for (const l of lines)
			expect(l.link).toEqual({ to: "/missions/$id/roster" });
	});

	it("reads the entries from issue paths when rosterEntryIds is absent", () => {
		const lines = blockerDetails(
			{
				reason: "estimate_missing",
				issues: [
					{ path: ["roster", LEON_ENTRY_ID, "estimatedTokens"], message: "x" },
				],
			},
			{ roster: ROSTER },
		);
		expect(lines.map((l) => l.text)).toEqual(["Leon has no token estimate."]);
	});

	it("gives a requirement missing both its criterion and its module two lines, criterion first", () => {
		// checkPlan runs the brief's rules before the module rules.
		const lines = blockerDetails(
			{
				reason: "plan_check_failed",
				issues: [
					{
						path: ["brief", "requirements", 1, "acceptanceCriteria"],
						message: "x",
					},
					{ path: ["brief", "requirements", 1], message: "x" },
				],
			},
			{ brief: BRIEF },
		);
		expect(lines.map((l) => l.text)).toEqual([
			"Requirement R2 has no acceptance criterion.",
			"Requirement R2 must be in exactly one module.",
		]);
	});

	it("collapses plan issues that read the same, counting the plain ones", () => {
		const lines = blockerDetails(
			{
				reason: "plan_check_failed",
				issues: [
					{ path: ["brief", "requirements", 0, "text"], message: "x" },
					{ path: ["brief", "modules", 0, "requirementIds", 0], message: "x" },
					{ path: ["brief", "goal"], message: "x" },
					{ path: ["brief", "modules", 0, "requirementIds", 1], message: "x" },
					{ path: ["brief", "requirements", 1], message: "x" },
				],
			},
			{ brief: BRIEF },
		);
		expect(lines.map((l) => l.text)).toEqual([
			"The plan has 2 issues to fix.",
			"Module M1 lists a requirement that isn't in the plan, or lists one twice.",
			"Requirement R2 must be in exactly one module.",
		]);
		expect(new Set(lines.map((l) => l.key)).size).toBe(3);
		const [one] = blockerDetails({
			reason: "plan_check_failed",
			issues: [{ path: ["brief", "goal"], message: "x" }],
		});
		expect(one?.text).toBe("The plan has an issue to fix.");
	});

	it("says which wave has no agent, by its team", () => {
		const [line] = blockerDetails({
			reason: "coherence_blocked",
			wave: "A",
			issues: [{ path: ["coherence", "block"], message: "x" }],
		});
		expect(line?.text).toBe(
			`No active agent in wave ${waveTitle("A")}, the playbook's first wave.`,
		);
		expect(line?.link).toEqual({ to: "/missions/$id/roster" });
		const [none] = blockerDetails({
			reason: "coherence_blocked",
			wave: null,
			issues: [{ path: ["coherence", "block"], message: "x" }],
		});
		expect(none?.text).toBe("No active agent in the playbook's first wave.");
	});

	it("sends a missing playbook to the mission's playbook page (audit D6)", () => {
		expect(
			blockerDetails({
				reason: "coherence_blocked",
				issues: [{ path: ["playbook"], message: "x" }],
			}),
		).toEqual([
			{
				key: "playbook",
				text: "No live playbook matches this mission's type.",
				link: { to: "/missions/$id/playbook" },
			},
		]);
	});

	it("links each plan issue to its item on the plan page", () => {
		const lines = blockerDetails(ALL_FAILING[2] as ReadinessBlocker, {
			brief: BRIEF,
		});
		expect(lines.map((l) => l.link)).toEqual([
			{ to: "/missions/$id/plan", hash: "plan-requirement-R2" },
			{ to: "/missions/$id/plan", hash: "plan-module-M1" },
		]);
	});

	it("never repeats the server's issue message", () => {
		const text = ALL_FAILING.flatMap((b) =>
			blockerDetails(b, { roster: ROSTER, brief: BRIEF }),
		)
			.map((l) => l.text)
			.join(" ");
		expect(text).not.toContain("server words");
		expect(text).not.toContain("R2 is in no module");
	});

	it("adds nothing for a mission that already started: there is nothing to fix", () => {
		expect(blockerDetails({ reason: "mission_not_draft" })).toEqual([]);
	});

	it("sends a closed engagement to its client, when the client is known", () => {
		const [line] = blockerDetails(
			{ reason: "engagement_closed" },
			{ clientId: CLIENT_ID },
		);
		expect(line?.link).toEqual({ to: "/clients/$id", clientId: CLIENT_ID });
		const [bare] = blockerDetails({ reason: "engagement_closed" });
		expect(bare?.link).toBeUndefined();
	});
});

describe("startBlockedReason", () => {
	it("enables Start only when ready and signed in", () => {
		expect(startBlockedReason(READY, false)).toBeUndefined();
		// The first blocker, as start would refuse with it.
		expect(startBlockedReason(NOT_READY, false)).toBe(
			PRECONDITION_COPY.mission_not_draft.what,
		);
		expect(startBlockedReason({ status: "pending" }, false)).toBe(
			"Checking whether it's ready",
		);
		expect(startBlockedReason(READY, true)).toBe("Sign in to start a mission");
	});
});

describe("refusedBlocker", () => {
	it("reads a refused Start's details as a blocker", () => {
		expect(
			refusedBlocker(
				refusal({
					reason: "estimate_missing",
					missionId: MISSION_ID,
					rosterEntryIds: [LEON_ENTRY_ID],
				}),
			),
		).toEqual({ reason: "estimate_missing", rosterEntryIds: [LEON_ENTRY_ID] });
	});
});

// ---------------------------------------------------------------------------

describe("MissionStart", () => {
	const props = { start: never, halt: never };

	it("lists every failing check in order with its copy and lines, Start off", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "draft" }}
				readiness={NOT_READY}
				context={{ roster: ROSTER, brief: BRIEF }}
				{...props}
			/>,
		);
		const reasons = [...html.matchAll(/data-reason="([a-z_]+)"/g)].map(
			(m) => m[1],
		);
		expect(reasons).toEqual(ALL_FAILING.map((b) => b.reason));
		expect(region(html, "mission-readiness-0")).toContain(
			PRECONDITION_COPY.mission_not_draft.what,
		);
		expect(region(html, "mission-readiness-2-lines-0")).toMatch(
			/^ ?Requirement R2 must be in exactly one module\. Open the plan/,
		);
		expect(html).toContain(
			`href="/missions/${MISSION_ID}/plan#plan-requirement-R2"`,
		);
		expect(region(html, "mission-readiness-3-lines-0")).toMatch(
			/^ ?No active agent in wave A · /,
		);
		expect(region(html, "mission-readiness-4-lines-0")).toMatch(
			/^ ?Atlas · Booking has no token estimate\. Open the roster/,
		);
		expect(region(html, "mission-readiness-4-lines-1")).toMatch(
			/^ ?Leon has no token estimate\./,
		);
		expect(html).toMatch(
			/data-testid="mission-start-button"[^>]*disabled=""|disabled=""[^>]*data-testid="mission-start-button"/,
		);
		expect(region(html, "mission-start-reason")).toMatch(
			new RegExp(`^ ?${PRECONDITION_COPY.mission_not_draft.what}`),
		);
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
		expect(html).not.toContain("server words");
	});

	it("shows every check, passing ones with a pass glyph, in the server's order", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "draft" }}
				readiness={ready({
					missionId: MISSION_ID,
					ready: false,
					blockers: [{ reason: "engagement_closed" }],
					warnings: [],
				})}
				{...props}
			/>,
		);
		const checks = [...html.matchAll(/data-check="([a-z_]+)"/g)].map(
			(m) => m[1],
		);
		expect(checks).toEqual([...READINESS_REASONS]);
		READINESS_REASONS.forEach((reason, i) => {
			const row = tagOf(html, `mission-readiness-${i}`);
			const state = reason === "engagement_closed" ? "block" : "pass";
			expect(row, reason).toContain(`data-state="${state}"`);
			expect(region(html, `mission-readiness-${i}-label`)).toMatch(
				new RegExp(
					`^ ?${READINESS_CHECK_LABEL[reason].replace("'", "&#x27;")}`,
				),
			);
		});
		expect(region(html, "mission-readiness-1-lines-0")).toMatch(
			/^ ?The engagement is managed on its client/,
		);
		expect(region(html, "mission-start-reason")).toMatch(
			new RegExp(
				`^ ?${PRECONDITION_COPY.engagement_closed.what.replace("'", "&#x27;")}`,
			),
		);
		expect(html).not.toContain("mission-readiness-warnings");
	});

	it("notes a missing spend limit apart from the checks, and still lets the mission start", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "draft" }}
				readiness={ready({
					missionId: MISSION_ID,
					ready: true,
					blockers: [],
					warnings: [{ reason: "spend_ceiling_missing" }],
				})}
				{...props}
			/>,
		);
		expect(
			region(html, "mission-readiness-warning-spend_ceiling_missing"),
		).toContain(
			READINESS_WARNING_TEXT.spend_ceiling_missing.replaceAll("'", "&#x27;"),
		);
		expect(html).not.toContain('data-state="block"');
		expect(tagOf(html, "mission-start-button")).not.toContain('disabled=""');
	});

	it("enables Start when every check passes", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "draft" }}
				readiness={READY}
				{...props}
			/>,
		);
		expect(html).toContain('data-testid="mission-readiness-clear"');
		expect(html).not.toMatch(
			/data-testid="mission-start-button"[^>]*disabled=""|disabled=""[^>]*data-testid="mission-start-button"/,
		);
	});

	it("says Sign in in the preview, even when ready", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "draft" }}
				readiness={READY}
				{...props}
			/>,
			true,
		);
		expect(html).toContain("Sign in to start a mission");
	});

	it("an active mission offers Halt, held to confirm, and no Start", () => {
		const html = render(
			<MissionStart
				mission={{ id: MISSION_ID, status: "active" }}
				readiness={READY}
				{...props}
			/>,
		);
		expect(html).toContain('data-testid="mission-halt-button"');
		expect(html).toContain("Hold to halt");
		expect(html).not.toContain('data-testid="mission-start-button"');
		expect(html).not.toContain('data-testid="mission-readiness"');
	});

	it("a refused Start shows its one reason and its agents by name", () => {
		const html = render(
			<Refusal
				error={refusal({
					reason: "estimate_missing",
					missionId: MISSION_ID,
					rosterEntryIds: [LEON_ENTRY_ID],
				})}
				context={{ roster: ROSTER }}
				missionId={MISSION_ID}
				testId="mission-start-error"
			/>,
		);
		expect(html).toContain('role="alert"');
		const text = region(html, "mission-start-error");
		expect(text).toContain(PRECONDITION_COPY.estimate_missing.what);
		expect(text).toContain("Leon has no token estimate.");
		expect(text).toContain(PRECONDITION_COPY.estimate_missing.next);
		expect(text).not.toContain("server message");
		expect(text).not.toMatch(UUID_FRAGMENT);
	});

	it("a refused Start for the plan lists each issue in our words", () => {
		const html = render(
			<Refusal
				error={refusal({
					reason: "plan_check_failed",
					missionId: MISSION_ID,
					issues: [{ path: ["brief", "modules"], message: "server words" }],
				})}
				context={{}}
				missionId={MISSION_ID}
				testId="mission-start-error"
			/>,
		);
		expect(region(html, "mission-start-error-lines-0")).toMatch(
			/^ ?The plan has no modules\. Open the plan/,
		);
		expect(html).not.toContain("server words");
	});

	it("a halted, shipped or archived mission shows neither", () => {
		for (const status of ["halted", "shipped", "archived"] as const) {
			const html = render(
				<MissionStart
					mission={{ id: MISSION_ID, status }}
					readiness={READY}
					{...props}
				/>,
			);
			expect(html).not.toContain("mission-start");
			expect(html).not.toContain("mission-halt");
		}
	});
});
