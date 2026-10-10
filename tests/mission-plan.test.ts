import { updateMissionPlanBody } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { planReadOnlyReason } from "@/components/avel/plan-region";
import {
	approvedChangeIssues,
	issuesByTarget,
	issueTarget,
	locksOf,
	nextId,
	type PlanDraft,
	planBodyOf,
	planDraftOf,
	planShapeProblems,
	planValidationIssues,
} from "@/lib/api/mission-plans";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { contractError } from "./clients-fixtures";
import { approvedBrief, plan } from "./mission-plan-fixtures";

function draft(): PlanDraft {
	const d = planDraftOf(plan());
	if (d === null) throw new Error("fixture has a brief");
	return d;
}

describe("the plan as a draft", () => {
	it("is nothing to edit when the stored brief predates the shape", () => {
		expect(planDraftOf(plan({ brief: null }))).toBeNull();
	});

	it("copies the brief, so editing the draft never touches the cached plan", () => {
		const p = plan();
		const d = planDraftOf(p);
		d?.brief.modules[0]?.requirementIds.push("R2");
		expect(p.brief?.modules[0]?.requirementIds).toEqual(["R1"]);
	});

	it("sends the whole plan, an empty template as null, and the contract accepts it", () => {
		const body = planBodyOf({ ...draft(), templateRef: "  " });
		expect(body.templateRef).toBeNull();
		expect(body.templateVersion).toBeNull();
		expect(body.brief.requirements.map((r) => r.id)).toEqual(["R1", "R2"]);
		expect(updateMissionPlanBody.safeParse(body).success).toBe(true);
	});
});

describe("what an approved brief locks", () => {
	it("locks the summary and the approved ids, nothing the planner added", () => {
		const locks = locksOf(approvedBrief());
		expect(locks.summary).toBe(true);
		expect([...locks.requirements]).toEqual(["R1"]);
		expect([...locks.criteria]).toEqual(["AC1"]);
	});

	it("locks nothing for a mission no intake created", () => {
		const locks = locksOf(null);
		expect(locks.summary).toBe(false);
		expect(locks.requirements.size).toBe(0);
	});
});

describe("new ids", () => {
	it("continue after the highest, never reuse one in the list", () => {
		expect(nextId("R", ["R1", "R3"])).toBe("R4");
		expect(nextId("AC", ["AC2", "AC10"])).toBe("AC11");
		expect(nextId("M", [])).toBe("M1");
		expect(nextId("R", ["X9", "R0"])).toBe("R1");
	});
});

describe("where an issue belongs, by path (never by message)", () => {
	const brief = plan().brief;

	it("turns a position into the item's id in the brief it was found in", () => {
		expect(issueTarget(["brief", "requirements", 1], brief)).toBe(
			"requirement:R2",
		);
		expect(issueTarget(["brief", "requirements", 0, "id"], brief)).toBe(
			"requirement:R1",
		);
		expect(
			issueTarget(["brief", "acceptanceCriteria", 1, "requirementId"], brief),
		).toBe("criterion:AC2");
		expect(
			issueTarget(["brief", "modules", 0, "requirementIds", 3], brief),
		).toBe("module:M1");
	});

	it("keeps list-wide and field issues on the list or field", () => {
		expect(issueTarget(["brief", "modules"], brief)).toBe("modules");
		expect(issueTarget(["brief", "requirements"], brief)).toBe("requirements");
		expect(issueTarget(["brief", "summary"], brief)).toBe("summary");
		expect(issueTarget(["templateVersion"], brief)).toBe("templateVersion");
		// A position the brief does not have stays on its list.
		expect(issueTarget(["brief", "requirements", 9], brief)).toBe(
			"requirements",
		);
	});

	it("has no place for a path it cannot map: that stays plan-wide", () => {
		expect(issueTarget(["brief"], brief)).toBeNull();
		expect(issueTarget(["brief", "nope"], brief)).toBeNull();
	});

	it("groups messages as the server wrote them", () => {
		const grouped = issuesByTarget(plan().check.issues, brief);
		expect(grouped.get("requirement:R2")).toEqual(["R2 is in no module"]);
	});
});

describe("reading a refused save", () => {
	it("takes the approved-brief changes from plan_changes_approved_brief", () => {
		const issues = [
			{
				path: ["brief", "requirements", 0, "text"],
				message: "R1 was approved and its text cannot change",
			},
		];
		const error = contractError(422, "PRECONDITION_FAILED", {
			reason: "plan_changes_approved_brief",
			issues,
		});
		expect(approvedChangeIssues(error)).toEqual(issues);
		expect(
			approvedChangeIssues(
				contractError(422, "PRECONDITION_FAILED", {
					reason: "mission_not_editable",
				}),
			),
		).toEqual([]);
	});

	it("takes the body's shape problems from VALIDATION_FAILED", () => {
		const error = contractError(400, "VALIDATION_FAILED", {
			body: [{ path: ["brief", "summary"], message: "too small" }],
		});
		expect(planValidationIssues(error)).toEqual([
			{ path: ["brief", "summary"], message: "too small" },
		]);
		expect(planValidationIssues(contractError(404, "NOT_FOUND"))).toEqual([]);
	});
});

describe("what blocks a save before it is sent", () => {
	it("is only the body's shape, never the plan check", () => {
		// No modules and R2 placed nowhere: the check's rules, not shape.
		const d = draft();
		d.brief.modules = [];
		expect(planShapeProblems(d).size).toBe(0);
	});

	it("names an empty text on its item", () => {
		const d = draft();
		d.brief.requirements[1] = { id: "R2", text: "  " };
		expect(planShapeProblems(d).get("requirement:R2")).toEqual([
			"Give each requirement 1 to 2,000 characters.",
		]);
	});

	it("puts half a template on the commit, in the contract's words", () => {
		const d = { ...draft(), templateRef: "template-booking" };
		expect(planShapeProblems(d).get("templateVersion")).toEqual([
			"templateRef and templateVersion are set together or not at all",
		]);
	});
});

describe("when the plan cannot change", () => {
	const copy = PRECONDITION_COPY.mission_not_editable;
	const reason = `${copy.what} ${copy.next}`;

	it("is any mission that is not a draft, with mission_not_editable's copy", () => {
		expect(planReadOnlyReason("draft", null)).toBeNull();
		expect(planReadOnlyReason("active", null)).toBe(reason);
	});

	it("is also a draft whose save was refused because it left draft", () => {
		const error = contractError(422, "PRECONDITION_FAILED", {
			reason: "mission_not_editable",
		});
		expect(planReadOnlyReason("draft", error)).toBe(reason);
	});
});
