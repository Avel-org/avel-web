import type { Intake } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { intakeTitle } from "@/components/avel/intake-list";
import { approveFieldOf, reviseFieldOf } from "@/components/avel/intake-modals";
import { ruleOfPath } from "@/components/avel/intake-page";
import { INTAKE_LIFECYCLE, mainLine } from "@/components/avel/lifecycle";
import { ApiError } from "@/lib/api/errors";
import {
	briefFromLines,
	checkIntakeBrief,
	combineIntakePages,
	combineReads,
	criterionLines,
	openCanonQuestions,
	questionsFromLines,
	requirementLines,
} from "@/lib/api/intakes";
import { queryKeys } from "@/lib/api/keys";

/*
 * The intake flow's pure parts (audit F7): its keys, the client-side check
 * that mirrors avel-server's, the brief as typed lines, the reads put
 * together across engagements, and where a refusal's issues land.
 */

const ENG_A = "00000000-0000-4000-8000-0000000000a1";
const ENG_B = "00000000-0000-4000-8000-0000000000b1";

const intake = (n: number, over: Partial<Intake> = {}): Intake => ({
	id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
	engagementId: ENG_A,
	status: "draft",
	sourceMd: "# Booking holds\nHold a slot while payment completes.",
	proposedBrief: null,
	openQuestions: [],
	derivedCut: null,
	derivedCutEvidence: null,
	derivedConventions: null,
	derivedBoundaries: null,
	repoUrl: null,
	repoCommitSha: null,
	repoReadAt: null,
	suggestedPresetId: null,
	recommendedRoster: null,
	draftedByCanonSessionId: null,
	openCanonSessionId: null,
	approvedBy: null,
	approvedAt: null,
	missionId: null,
	createdAt: `2026-10-0${n}T09:00:00.000Z`,
	updatedAt: `2026-10-0${n}T09:00:00.000Z`,
	...over,
});

const BRIEF = {
	summary: "Hold a slot while payment completes",
	requirements: [
		{ id: "R1", text: "A slot can be held" },
		{ id: "R2", text: "A hold frees itself" },
	],
	acceptanceCriteria: [
		{ id: "AC1", requirementId: "R1", text: "Holding marks the slot taken" },
		{ id: "AC2", requirementId: "R2", text: "After ten minutes it frees" },
	],
};

describe("intake keys", () => {
	it("keep every list under intakes/list, one entry per engagement and status", () => {
		expect(queryKeys.intakes.byEngagement(ENG_A, 50)).toEqual([
			"intakes",
			"list",
			{ engagementId: ENG_A, limit: 50 },
		]);
		expect(queryKeys.intakes.byEngagement(ENG_A, 1, "draft")).toEqual([
			"intakes",
			"list",
			{ engagementId: ENG_A, limit: 1, status: "draft" },
		]);
		expect(queryKeys.intakes.byEngagement(ENG_A, 50).slice(0, 2)).toEqual(
			queryKeys.intakes.lists(),
		);
		expect(queryKeys.intakes.detail("x")).toEqual(["intakes", "detail", "x"]);
	});
});

describe("the intake lifecycle (audit D5)", () => {
	it("runs draft, proposed, approved, with rejected off the line", () => {
		expect(mainLine(INTAKE_LIFECYCLE, "proposed")).toEqual([
			{ state: "draft", standing: "passed" },
			{ state: "proposed", standing: "current" },
			{ state: "approved", standing: "ahead" },
		]);
		expect(INTAKE_LIFECYCLE.place.rejected).toEqual({
			line: "branch",
			after: null,
		});
		// Rejected names no step it left from, so none shows as passed.
		expect(
			mainLine(INTAKE_LIFECYCLE, "rejected").every(
				(s) => s.standing === "ahead",
			),
		).toBe(true);
	});
});

describe("the intake check, before Propose", () => {
	it("passes a whole brief", () => {
		expect(checkIntakeBrief(BRIEF)).toEqual([]);
	});

	it("says there is no brief", () => {
		expect(checkIntakeBrief(null)).toEqual([
			{
				rule: "brief",
				path: ["proposedBrief"],
				message: "There is no brief yet",
			},
		]);
	});

	it("places each issue under its rule, with the server's words", () => {
		const issues = checkIntakeBrief({
			...BRIEF,
			requirements: [...BRIEF.requirements, { id: "R1", text: "Again" }],
			acceptanceCriteria: [
				BRIEF.acceptanceCriteria[0],
				{ id: "AC2", requirementId: "R9", text: "Cites nothing" },
			],
		});
		expect(issues.map((i) => [i.rule, i.message])).toEqual([
			["requirements", "Requirement id R1 is used more than once"],
			["criteria", "AC2 cites R9, which is not a requirement"],
			["coverage", "R2 has no acceptance criterion"],
		]);
	});

	it("refuses modules: the plan adds them", () => {
		const issues = checkIntakeBrief({
			...BRIEF,
			modules: [{ id: "M1", name: "Holds", requirementIds: ["R1"] }],
		});
		expect(issues.map((i) => i.rule)).toEqual(["modules"]);
	});

	it("files a server issue under the same rule by its path", () => {
		expect(ruleOfPath(["proposedBrief", "requirements", 1, "id"])).toBe(
			"requirements",
		);
		expect(
			ruleOfPath(["proposedBrief", "requirements", 0, "acceptanceCriteria"]),
		).toBe("coverage");
		expect(
			ruleOfPath(["proposedBrief", "acceptanceCriteria", 0, "requirementId"]),
		).toBe("criteria");
		expect(ruleOfPath(["proposedBrief", "modules"])).toBe("modules");
		expect(ruleOfPath(["proposedBrief", "summary"])).toBe("brief");
	});
});

describe("the brief as lines, for Revise", () => {
	it("round-trips a brief", () => {
		const { brief, issues } = briefFromLines({
			summary: BRIEF.summary,
			requirements: requirementLines(BRIEF),
			criteria: criterionLines(BRIEF),
		});
		expect(issues).toEqual([]);
		expect(brief).toEqual(BRIEF);
	});

	it("names each line that is not in the form, and skips blank ones", () => {
		const { brief, issues } = briefFromLines({
			summary: "s",
			requirements: "R1 Fine\n\nno id here",
			criteria: "AC1 R1 Fine\nAC2 missing the requirement",
		});
		expect(brief.requirements).toEqual([{ id: "R1", text: "Fine" }]);
		expect(issues.map((i) => [i.field, i.line])).toEqual([
			["requirements", 3],
			["criteria", 2],
		]);
	});

	it("drops blank and repeated questions", () => {
		expect(
			questionsFromLines("Which PSP?\n\n Which PSP? \nWho signs off?"),
		).toEqual(["Which PSP?", "Who signs off?"]);
	});
});

describe("a client's intakes, across its engagements", () => {
	it("puts the pages together newest first, the totals summed", () => {
		const { rows, total } = combineIntakePages([
			{ data: [intake(1)], meta: { total: 3 } },
			{ data: [intake(2, { engagementId: ENG_B })], meta: { total: 1 } },
		]);
		expect(rows.map((r) => r.createdAt)).toEqual([
			intake(2).createdAt,
			intake(1).createdAt,
		]);
		expect(total).toBe(4);
	});

	it("is pending until every read is in, an error if any failed, and as old as the oldest", () => {
		const ok = (data: number, at: number) => ({
			status: "success" as const,
			data,
			error: null,
			dataUpdatedAt: at,
			isFetching: false,
			refetch: () => {},
		});
		const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
		expect(
			combineReads([ok(1, 5), { ...ok(0, 0), status: "pending" }], sum).status,
		).toBe("pending");
		const both = combineReads([ok(1, 5), ok(2, 3)], sum);
		expect(both.status === "success" && both.data).toBe(3);
		expect(both.dataUpdatedAt).toBe(3);
		const error = new ApiError({
			method: "GET",
			path: "/api/intakes",
			kind: "unreachable",
		});
		expect(
			combineReads([ok(1, 5), { ...ok(0, 0), status: "error", error }], sum)
				.status,
		).toBe("error");
		// No engagements: nothing to read, an empty success.
		expect(combineReads([], sum).status).toBe("success");
	});

	it("titles a row by its brief's summary, else its source's first line", () => {
		expect(intakeTitle(intake(1))).toBe("Booking holds");
		expect(
			intakeTitle(
				intake(1, { proposedBrief: { ...BRIEF, modules: [], checks: [] } }),
			),
		).toBe(BRIEF.summary);
		expect(intakeTitle(intake(1, { sourceMd: "" }))).toBe("Untitled intake");
	});
});

describe("where a refusal's issues land", () => {
	it("puts Revise's issues on their fields", () => {
		expect(reviseFieldOf(["proposedBrief", "summary"])).toBe("summary");
		expect(reviseFieldOf(["proposedBrief", "requirements", 0, "id"])).toBe(
			"requirements",
		);
		expect(reviseFieldOf(["proposedBrief", "acceptanceCriteria", 1])).toBe(
			"criteria",
		);
		expect(reviseFieldOf(["openQuestions", 0])).toBe("questions");
		expect(reviseFieldOf(["sourceMd"])).toBe("source");
	});

	it("gives Canon's open questions their own list on Approve", () => {
		expect(approveFieldOf(["canonQuestions", "q1"])).toBe("canonQuestions");
		expect(approveFieldOf(["repoUrl"])).toBe("repoUrl");
		expect(approveFieldOf(["proposedBrief", "requirements"])).toBeNull();
	});

	it("reads intake_questions_open's questions by their headers", () => {
		const refused = new ApiError({
			method: "POST",
			path: "/api/intakes/x/approve",
			kind: "contract",
			status: 422,
			code: "PRECONDITION_FAILED",
			message: "for logs only",
			requestId: "req-1",
			details: {
				reason: "intake_questions_open",
				issues: [
					{
						path: ["canonQuestions", "q1"],
						message: "Which payment provider?",
					},
					{ path: ["canonQuestions", "q2"], message: "Who signs off?" },
				],
			},
		});
		expect(openCanonQuestions(refused)).toEqual([
			{ id: "q1", header: "Which payment provider?" },
			{ id: "q2", header: "Who signs off?" },
		]);
		expect(openCanonQuestions(new Error("other"))).toEqual([]);
	});
});
