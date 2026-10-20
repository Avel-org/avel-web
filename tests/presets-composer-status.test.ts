import { describe, expect, it } from "vitest";
import {
	type ComposerRequirements,
	NO_REQUIREMENTS,
} from "@/components/avel/preset-coverage-grid";
import { laneStatus } from "@/components/avel/preset-lanes";

/** Booking uses this team and declares waves A and B; A starts it. */
const BOOKING: ComposerRequirements = {
	waves: {},
	roles: {},
	known: true,
	checkedBy: ["Booking"],
	declared: { A: ["Booking"], B: ["Booking"] },
};

describe("a lane's status (the header's glyph and two lines)", () => {
	it("is never a pass while the lane is empty", () => {
		for (const req of [BOOKING, NO_REQUIREMENTS])
			for (const wave of ["A", "B", "E"] as const)
				expect(laneStatus(wave, 0, req).tone).not.toBe("pass");
	});

	it("warns on the empty wave a playbook starts in", () => {
		const req = { ...BOOKING, waves: { A: "Booking starts in wave A." } };
		const s = laneStatus("A", 0, req);
		expect(s.tone).toBe("warn");
		expect(s.note).toBe("Needed to start");
		expect(s.title).toBe("Booking starts in wave A.");
	});

	it("is pending on any other empty lane, saying how many run it", () => {
		expect(laneStatus("B", 0, BOOKING)).toMatchObject({
			tone: "pending",
			count: "0 agents",
			note: "1 playbook runs it",
		});
		expect(laneStatus("E", 0, BOOKING)).toMatchObject({
			tone: "pending",
			note: "Not in a playbook",
		});
	});

	it("passes only a staffed lane where nothing is missing", () => {
		expect(laneStatus("B", 2, BOOKING)).toMatchObject({
			tone: "pass",
			count: "2 agents",
			note: "1 playbook runs it",
		});
	});

	it("is pending, staffed or not, when no playbook checks the team", () => {
		for (const n of [0, 3]) {
			const s = laneStatus("C", n, NO_REQUIREMENTS);
			expect(s.tone).toBe("pending");
			expect(s.note).toBe("Not checked");
		}
	});

	it("keeps both lines short, the full sentence in the title", () => {
		const two = { ...BOOKING, declared: { B: ["Booking", "Discovery"] } };
		const s = laneStatus("B", 1, two);
		expect(s.count).toBe("1 agent");
		expect(s.note).toBe("2 playbooks run it");
		expect(s.title).toContain("Booking, Discovery declares wave B");
	});
});
