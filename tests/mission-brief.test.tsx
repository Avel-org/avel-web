import { briefSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Brief, groupBrief } from "@/components/avel/mission-details";

// Fixtures parse through the intake's own schema, so they cannot drift from
// the brief shape avel-server approves.
const BRIEF = briefSchema.parse({
	summary: "A booking flow for the clinic.",
	requirements: [
		{ id: "R1", text: "Patients book a slot." },
		{ id: "R2", text: "Staff see the day's bookings." },
		{ id: "R3", text: "Reminders go out a day before." },
	],
	// Out of order on purpose: criteria group by the id they cite.
	acceptanceCriteria: [
		{ id: "AC1", requirementId: "R2", text: "The day view lists bookings." },
		{ id: "AC2", requirementId: "R1", text: "A free slot can be booked." },
		{ id: "AC3", requirementId: "R1", text: "A taken slot cannot." },
		{ id: "AC4", requirementId: "R9", text: "Cites nothing in the brief." },
	],
});

// The same brief, planned: M2 names a requirement the brief lacks, R1 sits
// in two modules and R3 in none. The view shows each as it is.
const PLANNED = briefSchema.parse({
	...BRIEF,
	modules: [
		{ id: "M1", name: "Booking", requirementIds: ["R2", "R1"] },
		{ id: "M2", name: "Front desk", requirementIds: ["R1", "R7"] },
	],
});

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("groupBrief", () => {
	it("puts each criterion under the requirement it cites, in the brief's order", () => {
		const { modules, unplaced } = groupBrief(BRIEF);
		expect(modules).toEqual([]);
		expect(unplaced.map((g) => g.requirement.id)).toEqual(["R1", "R2", "R3"]);
		expect(unplaced.map((g) => ids(g.criteria))).toEqual([
			["AC2", "AC3"],
			["AC1"],
			[],
		]);
	});

	it("keeps a criterion citing no requirement apart, never dropped", () => {
		expect(ids(groupBrief(BRIEF).uncited)).toEqual(["AC4"]);
	});

	it("gives a repeated requirement id's criteria to the first", () => {
		const { unplaced } = groupBrief(
			briefSchema.parse({
				summary: "s",
				requirements: [
					{ id: "R1", text: "first" },
					{ id: "R1", text: "second" },
				],
				acceptanceCriteria: [{ id: "AC1", requirementId: "R1", text: "c" }],
			}),
		);
		expect(unplaced.map((g) => ids(g.criteria))).toEqual([["AC1"], []]);
	});

	it("puts requirements under each module that names them, in the module's order", () => {
		const { modules, unplaced } = groupBrief(PLANNED);
		expect(
			modules.map((m) => [
				m.module.id,
				ids(m.groups.map((g) => g.requirement)),
			]),
		).toEqual([
			["M1", ["R2", "R1"]],
			["M2", ["R1"]],
		]);
		// Criteria travel with their requirement.
		expect(ids(modules[0]?.groups[1]?.criteria ?? [])).toEqual(["AC2", "AC3"]);
		expect(modules.map((m) => m.missing)).toEqual([[], ["R7"]]);
		expect(unplaced.map((g) => g.requirement.id)).toEqual(["R3"]);
	});
});

describe("the brief", () => {
	const html = renderToString(<Brief brief={BRIEF} />);

	/** The markup from one test id to the next one of its kind, or the end. */
	const block = (testid: string, next?: string) => {
		const start = html.indexOf(`data-testid="${testid}"`);
		expect(start, testid).toBeGreaterThan(-1);
		const end = next ? html.indexOf(`data-testid="${next}"`, start) : -1;
		return html.slice(start, end === -1 ? undefined : end);
	};

	it("shows the approved shape as requirements with their criteria", () => {
		expect(html).toContain('data-shape="plan"');
		expect(html).toContain("A booking flow for the clinic.");
		const r1 = block(
			"mission-brief-requirement-R1",
			"mission-brief-requirement-R2",
		);
		expect(r1).toContain("Patients book a slot.");
		expect(r1).toContain("A free slot can be booked.");
		expect(r1).toContain("A taken slot cannot.");
		expect(r1).not.toContain("The day view lists bookings.");
	});

	it("marks a requirement with no criterion", () => {
		expect(block("mission-brief-requirement-R3")).toContain(
			'data-testid="mission-brief-no-criteria"',
		);
		expect(
			block("mission-brief-requirement-R1", "mission-brief-requirement-R2"),
		).not.toContain("mission-brief-no-criteria");
	});

	it("lists an uncited criterion apart, with the id it cites", () => {
		const uncited = block("mission-brief-uncited");
		expect(uncited).toContain("Cites nothing in the brief.");
		expect(uncited).toContain("→ R9");
	});

	it("falls back to keys and values for a brief that does not parse", () => {
		const record = renderToString(
			<Brief brief={{ goal: "Ship the booking flow", pages: 4 }} />,
		);
		expect(record).toContain('data-shape="record"');
		expect(record).toContain(">goal<");
		expect(record).not.toContain("mission-brief-requirement");
	});

	it("shows a planned brief by module, with what no module holds apart", () => {
		const planned = renderToString(<Brief brief={PLANNED} />);
		const m1 = planned.slice(
			planned.indexOf('data-testid="mission-brief-module-M1"'),
			planned.indexOf('data-testid="mission-brief-module-M2"'),
		);
		expect(m1).toContain(">Booking<");
		expect(m1.indexOf("mission-brief-requirement-R2")).toBeLessThan(
			m1.indexOf("mission-brief-requirement-R1"),
		);
		expect(m1).not.toContain("mission-brief-module-missing");
		const m2 = planned.slice(
			planned.indexOf('data-testid="mission-brief-module-M2"'),
			planned.indexOf('data-testid="mission-brief-unplaced"'),
		);
		expect(m2).toContain("Names R7, not in the brief.");
		const unplaced = planned.slice(
			planned.indexOf('data-testid="mission-brief-unplaced"'),
		);
		expect(unplaced).toContain("mission-brief-requirement-R3");
		expect(unplaced).not.toContain("mission-brief-requirement-R1");
	});

	it("has no unplaced section when every requirement has a module", () => {
		const all = renderToString(
			<Brief
				brief={{
					...PLANNED,
					modules: [
						{ id: "M1", name: "All", requirementIds: ["R1", "R2", "R3"] },
					],
				}}
			/>,
		);
		expect(all).toContain("mission-brief-module-M1");
		expect(all).not.toContain("mission-brief-unplaced");
	});

	it("says so when the approved shape has no requirements yet", () => {
		const empty = renderToString(
			<Brief
				brief={briefSchema.parse({
					summary: "s",
					requirements: [],
					acceptanceCriteria: [],
				})}
			/>,
		);
		expect(empty).toContain('data-shape="plan"');
		expect(empty).toContain("No requirements yet.");
	});
});
