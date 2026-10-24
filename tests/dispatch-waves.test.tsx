import {
	type Brief,
	type Dispatch,
	type RosterEntry,
	rosterEntrySchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	blockedWaveWarning,
	DispatchRefusal,
	openWaveOf,
} from "@/components/avel/dispatch-controls";
import {
	bodyOf,
	defaultWave,
	draftProblems,
	initialDraft,
	NewDispatchForm,
	refusedStep,
	refusedWave,
	waveChoices,
} from "@/components/avel/dispatch-new";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { tagOf } from "./render-page";

/*
 * Waves on dispatches (avel-server, decided 2026-10-22): the wave picked when
 * queueing one, the refusal while an earlier wave is open, and the warning a
 * start carries past an earlier wave's blocked dispatches.
 */

const MISSION_ID = "3fcd1ce4-5eed-4000-8000-000000000071";
const ENTRY_ID = "e0e0e0e0-5eed-4000-8000-000000000071";
const ISO = "2026-10-24T09:00:00.000Z";
const OPEN_A = "d15a7c01-5eed-4000-8000-000000000071";
const OPEN_B = "d15a7c02-5eed-4000-8000-000000000071";
const GONE = "d15a7c09-5eed-4000-8000-000000000071";
const SELF = "d15a7c03-5eed-4000-8000-000000000071";

function entry(waves: RosterEntry["waves"]): RosterEntry {
	return rosterEntrySchema.parse({
		id: ENTRY_ID,
		missionId: MISSION_ID,
		agentTemplate: {
			id: "7ecead58-5eed-4000-8000-000000000071",
			slug: "leon",
			name: "Leon",
			kind: "feature",
			roles: [],
		},
		active: true,
		waves,
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
	});
}

const BRIEF: Brief = {
	summary: "s",
	requirements: [{ id: "R1", text: "Book a slot" }],
	acceptanceCriteria: [],
	modules: [{ id: "M1", name: "Booking", reads: [], requirementIds: ["R1"] }],
	checks: [],
};

// Only what a refusal or warning names a dispatch by.
const named = (id: string, name: string, wave: Dispatch["wave"]) =>
	({ id, agent: { name }, wave }) as Dispatch;
const OTHERS = [named(OPEN_A, "Atlas", "A"), named(OPEN_B, "Mira", "B")];
const SELF_DISPATCH = { ...named(SELF, "Leon", "C"), rosterEntryId: ENTRY_ID };

const refused = (reason: string, extra: Record<string, unknown> = {}) =>
	new ApiError({
		method: "POST",
		path: "/api/dispatches/:id/start",
		kind: "contract",
		status: 422,
		code: "PRECONDITION_FAILED",
		message: "for logs",
		requestId: "req_w",
		details: { reason, ...extra },
	} as ConstructorParameters<typeof ApiError>[0]);

describe("the wave picker", () => {
	it("offers the entry's waves the playbook runs, saying why the rest are off", () => {
		const choices = waveChoices(entry(["B", "C", "D"]), ["A", "B", "D"]);
		expect(choices).toEqual([
			{ wave: "A", offReason: "Leon isn't in wave A on the roster" },
			{ wave: "B", offReason: null },
			{ wave: "C", offReason: "The mission's playbook doesn't run wave C" },
			{ wave: "D", offReason: null },
			{ wave: "E", offReason: "Leon isn't in wave E on the roster" },
		]);
	});

	it("preselects the earliest wave it can run in, or none", () => {
		expect(defaultWave(entry(["C", "B"]), null)).toBe("B");
		expect(defaultWave(entry(["B", "C"]), ["C"])).toBe("C");
		expect(defaultWave(entry(["B"]), ["A"])).toBe("");
		expect(defaultWave(entry([]), null)).toBe("");
		// A mission with no live playbook runs no wave.
		expect(defaultWave(entry(["A"]), [])).toBe("");
	});

	it("sends the wave chosen, and holds the form when there is none", () => {
		const draft = initialDraft([entry(["D", "B"])], BRIEF.modules, null);
		expect(draft.wave).toBe("B");
		expect(bodyOf(draft).wave).toBe("B");
		expect(draftProblems(draft)).toEqual({});
		const none = initialDraft([entry(["B"])], BRIEF.modules, ["A"]);
		expect(draftProblems(none)).toEqual({
			wave: "This agent has no wave the playbook runs.",
		});
		expect(bodyOf(none)).not.toHaveProperty("wave");
	});

	it("draws A to E with the entry's waves on and the chosen one pressed", () => {
		const html = renderToString(
			<TooltipProvider>
				<InlineModals>
					<NewDispatchForm
						entries={[entry(["B", "C"])]}
						brief={BRIEF}
						applicable={["B", "C", "D"]}
						pending={false}
						error={null}
						onSubmit={() => {}}
					/>
				</InlineModals>
			</TooltipProvider>,
		);
		const wave = (w: string) => tagOf(html, `dispatch-new-wave-${w}`);
		expect(wave("B")).toContain('aria-pressed="true"');
		expect(wave("C")).toContain('aria-pressed="false"');
		expect(wave("C")).not.toMatch(/\sdisabled=""/);
		for (const off of ["A", "D", "E"]) expect(wave(off)).toMatch(/disabled/);
	});

	it("sends a wave refusal back to the agent step, in our words", () => {
		const error = refused("wave_not_applicable", { wave: "C" });
		expect(refusedStep(error, [])).toBe(0);
		expect(refusedWave(error)).toBe("The playbook doesn't run wave C.");
		expect(
			refusedWave(refused("wave_not_on_roster_entry", { wave: "E" })),
		).toBe("This agent isn't in wave E on the roster.");
		expect(refusedWave(refused("wave_not_on_roster_entry"))).toBe(
			"This agent is in no wave on the roster.",
		);
		expect(refusedWave(refused("wave_required"))).toBe(
			"Choose the wave this dispatch runs in.",
		);
		expect(refusedWave(refused("harness_unavailable"))).toBeNull();
	});
});

describe("starting past waves", () => {
	it("names an open earlier wave's dispatches, oldest first, linking each", () => {
		const error = refused("earlier_wave_open", {
			wave: "A",
			dispatchIds: [OPEN_A, GONE],
		});
		expect(openWaveOf(error, OTHERS)).toEqual({
			wave: "A",
			dispatches: [
				{ id: OPEN_A, name: "Atlas, wave A" },
				{ id: GONE, name: null },
			],
		});
		expect(openWaveOf(refused("harness_unavailable"), OTHERS)).toBeNull();

		const html = renderToString(
			<DispatchRefusal
				error={error}
				dispatch={SELF_DISPATCH as Dispatch}
				others={OTHERS}
			/>,
		);
		expect(tagOf(html, `dispatch-link-${OPEN_A}`)).toContain(
			`href="#dispatch-${OPEN_A}"`,
		);
		expect(html).toContain("Wave A still has these open:");
		expect(html).toContain("A dispatch no longer listed");
	});

	it("warns of an earlier wave's blocked dispatches, and is quiet without", () => {
		expect(blockedWaveWarning([], OTHERS)).toBeNull();
		expect(blockedWaveWarning([OPEN_B], OTHERS)).toBe(
			"Started. An earlier wave has a blocked dispatch (Mira, wave B), so this one starts without that work.",
		);
		expect(blockedWaveWarning([OPEN_A, GONE], OTHERS)).toBe(
			"Started. An earlier wave has blocked dispatches (Atlas, wave A; a dispatch no longer listed), so this one starts without that work.",
		);
	});
});
