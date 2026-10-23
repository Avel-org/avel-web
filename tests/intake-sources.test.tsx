import type { Intake, IntakeFile } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	citedItems,
	confirmAllDecisions,
	confirmedCount,
	fileOfChunk,
	IntakeSources,
} from "@/components/avel/intake-sources";
import { queryKeys } from "@/lib/api/keys";
import { inProviders, seededClient } from "./catalog-fixtures";
import { tagOf } from "./render-page";

/*
 * The brief's sources, reviewed (POST /api/intakes/:id/sources): each
 * passage confirmed or rejected, approval waiting until all are confirmed.
 */

const SHA = "a".repeat(64);
const CHUNK = `${SHA}:12-30`;
const OTHER = `${SHA}:40-41`;
const CONFIRMED = {
	by: "00000000-0000-4000-8000-000000000009",
	at: "2026-10-21T10:00:00.000Z",
};

const BRIEF: NonNullable<Intake["proposedBrief"]> = {
	summary: "Hold a slot while payment completes",
	requirements: [
		{
			id: "R1",
			text: "A slot can be held",
			sources: [{ chunkId: CHUNK, confirmed: null }],
		},
		{ id: "R2", text: "Nothing cited here" },
	],
	acceptanceCriteria: [
		{
			id: "AC1",
			requirementId: "R1",
			text: "Holding marks it taken",
			sources: [
				{ chunkId: CHUNK, confirmed: CONFIRMED },
				{ chunkId: OTHER, confirmed: null },
			],
		},
	],
	modules: [],
	checks: [],
};

const INTAKE_ID = "00000000-0000-4000-8000-000000007001";
const intake = (status: Intake["status"]) =>
	({ id: INTAKE_ID, status, proposedBrief: BRIEF }) as Intake;

const FILE = {
	id: "00000000-0000-4000-8000-000000008001",
	name: "booking-notes.md",
	sha256: SHA,
	purgedAt: null,
} as IntakeFile;

function render(status: Intake["status"]) {
	const qc = seededClient();
	qc.setQueryData(queryKeys.intakes.files(INTAKE_ID, true), {
		pages: [{ data: [FILE], meta: { nextCursor: null, total: 1 } }],
		pageParams: [undefined],
	});
	return inProviders(<IntakeSources intake={intake(status)} />, qc);
}

describe("the rules", () => {
	it("lists the items that cite a passage, requirements then criteria", () => {
		expect(citedItems(BRIEF).map((i) => i.id)).toEqual(["R1", "AC1"]);
		expect(citedItems(null)).toEqual([]);
	});

	it("counts every source, confirmed or not", () => {
		expect(confirmedCount(citedItems(BRIEF))).toEqual({
			confirmed: 1,
			total: 3,
		});
	});

	it("confirms only what still waits, each by its item and chunk", () => {
		expect(confirmAllDecisions(citedItems(BRIEF))).toEqual([
			{
				list: "requirements",
				itemId: "R1",
				chunkId: CHUNK,
				decision: "confirm",
			},
			{
				list: "acceptanceCriteria",
				itemId: "AC1",
				chunkId: OTHER,
				decision: "confirm",
			},
		]);
	});

	it("names a passage's file from the sha256 its chunk id starts with", () => {
		expect(fileOfChunk(CHUNK, [FILE])?.name).toBe("booking-notes.md");
		expect(fileOfChunk(`${"b".repeat(64)}:1-2`, [FILE])).toBeUndefined();
	});
});

describe("the panel", () => {
	it("on an open intake, offers Confirm and Reject for each waiting passage", () => {
		const html = render("proposed");
		expect(html).toContain(">1 of 3 confirmed<");
		expect(html).toContain("Approval waits until every source is confirmed.");
		expect(tagOf(html, `intake-source-confirm-R1-${CHUNK}`)).toContain(
			"button",
		);
		expect(tagOf(html, `intake-source-reject-AC1-${OTHER}`)).toContain(
			'aria-label="Reject this passage for AC1"',
		);
		expect(html).toContain(">Confirm all 2<");
		// The confirmed one says so, with when on hover.
		expect(tagOf(html, `intake-source-AC1-${CHUNK}`)).toContain(
			'data-confirmed="true"',
		);
		// Each chip names its file.
		expect(html).toContain(">booking-notes.md<");
	});

	it("once approved, is a record: no decisions offered", () => {
		const html = render("approved");
		expect(html).not.toContain("intake-source-confirm-");
		expect(html).not.toContain("intake-sources-confirm-all");
		expect(html).toContain(">Not confirmed<");
	});
});
