import { type Playbook, playbookSchema } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { nodeLabel } from "@/components/avel/playbook-builder";
import {
	addableGates,
	draftChanges,
	draftOf,
	draftReducer,
	moveSelection,
	pipelineOf,
	playbookBodyOf,
} from "@/components/avel/playbook-pipeline";

const PLAYBOOK: Playbook = playbookSchema.parse({
	id: "00000000-0000-4000-8000-000000000001",
	missionType: "template-booking",
	name: "Template booking",
	// Out of order on purpose: the rail is in WAVES order.
	wavesApplicable: ["C", "A"],
	gates: [
		{ gate: "qa", policy: "mandatory" },
		{ gate: "security", policy: "warn" },
	],
	deliverable: "pr",
	requiredFields: ["brief"],
	defaultPresetId: "00000000-0000-4000-8000-000000000301",
	version: 2,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-09T00:00:00.000Z",
});

const ids = (p: Pick<Playbook, "wavesApplicable" | "gates" | "deliverable">) =>
	pipelineOf(p).map((n) => n.id);

describe("pipelineOf", () => {
	it("runs every wave A to E, then the gates in stored order, then the deliverable", () => {
		expect(ids(PLAYBOOK)).toEqual([
			"wave-A",
			"wave-B",
			"wave-C",
			"wave-D",
			"wave-E",
			"gate-qa",
			"gate-security",
			"deliverable",
		]);
	});

	it("marks the waves it runs live and the rest skipped", () => {
		const waves = pipelineOf(PLAYBOOK).flatMap((n) =>
			n.kind === "wave" ? [[n.wave, n.applicable] as const] : [],
		);
		expect(waves).toEqual([
			["A", true],
			["B", false],
			["C", true],
			["D", false],
			["E", false],
		]);
	});

	it("keeps each gate's policy as stored", () => {
		expect(
			pipelineOf(PLAYBOOK).flatMap((n) =>
				n.kind === "gate" ? [n.policy] : [],
			),
		).toEqual(["mandatory", "warn"]);
	});
});

describe("the keyboard on the rail", () => {
	const nodes = pipelineOf(PLAYBOOK);

	it("starts at the first node from no selection", () => {
		expect(moveSelection(nodes, null, "ArrowDown")).toBe("wave-A");
		expect(moveSelection(nodes, null, "ArrowUp")).toBe("wave-A");
	});

	it("moves on and back, and stops at the ends", () => {
		expect(moveSelection(nodes, "wave-E", "ArrowDown")).toBe("gate-qa");
		expect(moveSelection(nodes, "gate-qa", "ArrowLeft")).toBe("wave-E");
		expect(moveSelection(nodes, "deliverable", "ArrowRight")).toBe(
			"deliverable",
		);
		expect(moveSelection(nodes, "wave-A", "ArrowUp")).toBe("wave-A");
	});

	it("jumps to the ends, and ignores other keys", () => {
		expect(moveSelection(nodes, "gate-qa", "Home")).toBe("wave-A");
		expect(moveSelection(nodes, "gate-qa", "End")).toBe("deliverable");
		expect(moveSelection(nodes, "gate-qa", "a")).toBeNull();
	});
});

describe("the draft", () => {
	const start = draftOf(PLAYBOOK);

	it("toggles a wave and keeps waves in A to E order", () => {
		const next = draftReducer(start, { type: "toggleWave", wave: "B" });
		expect(next.wavesApplicable).toEqual(["A", "B", "C"]);
		expect(
			draftReducer(next, { type: "toggleWave", wave: "A" }).wavesApplicable,
		).toEqual(["B", "C"]);
	});

	it("adds a gate once, at the end, as mandatory; removes and re-polices", () => {
		const added = draftReducer(start, { type: "addGate", gate: "rollback" });
		expect(added.gates.at(-1)).toEqual({
			gate: "rollback",
			policy: "mandatory",
		});
		expect(draftReducer(added, { type: "addGate", gate: "rollback" })).toBe(
			added,
		);
		expect(
			draftReducer(start, { type: "removeGate", gate: "qa" }).gates.map(
				(g) => g.gate,
			),
		).toEqual(["security"]);
		expect(
			draftReducer(start, { type: "setPolicy", gate: "qa", policy: "warn" })
				.gates[0],
		).toEqual({ gate: "qa", policy: "warn" });
	});

	it("offers only the closed vocabulary's missing gates", () => {
		expect(addableGates(PLAYBOOK.gates)).toEqual([
			"phase1-close",
			"alignment",
			"rollback",
			"acceptance",
		]);
	});

	it("adds a required field once, trimmed, and never a blank one", () => {
		expect(
			draftReducer(start, { type: "addField", field: " repo_url " })
				.requiredFields,
		).toEqual(["brief", "repo_url"]);
		expect(draftReducer(start, { type: "addField", field: "brief" })).toBe(
			start,
		);
		expect(draftReducer(start, { type: "addField", field: "  " })).toBe(start);
	});

	it("never changes the stored playbook, and reset returns to it", () => {
		const edited = draftReducer(start, { type: "toggleWave", wave: "E" });
		expect(PLAYBOOK.wavesApplicable).toEqual(["C", "A"]);
		expect(
			draftReducer(edited, { type: "reset", to: draftOf(PLAYBOOK) }),
		).toEqual(start);
	});

	it("says what publishing would change, and nothing for an untouched draft", () => {
		expect(draftChanges(PLAYBOOK, start)).toEqual([]);
		const edited = draftReducer(
			draftReducer(start, { type: "setPolicy", gate: "qa", policy: "warn" }),
			{ type: "toggleWave", wave: "B" },
		);
		expect(
			draftChanges(PLAYBOOK, edited).map((c) => [c.label, c.kind]),
		).toEqual([
			["Waves", "change"],
			["Gates", "change"],
		]);
	});

	it("shapes the write body from the draft, keeping the stored preset", () => {
		const edited = draftReducer(start, {
			type: "setName",
			name: "  Template booking 2 ",
		});
		expect(playbookBodyOf(PLAYBOOK, edited)).toEqual({
			name: "Template booking 2",
			wavesApplicable: ["A", "C"],
			gates: PLAYBOOK.gates,
			deliverable: "pr",
			requiredFields: ["brief"],
			defaultPresetId: PLAYBOOK.defaultPresetId,
		});
	});
});

describe("the canvas labels", () => {
	it("names a gate's policy as a hard stop or a pass-through", () => {
		const [qa, security] = pipelineOf(PLAYBOOK).filter(
			(n) => n.kind === "gate",
		);
		expect(qa && nodeLabel(qa)).toBe("Gate qa, mandatory, a hard stop");
		expect(security && nodeLabel(security)).toBe(
			"Gate security, warn, passes through",
		);
	});
});
