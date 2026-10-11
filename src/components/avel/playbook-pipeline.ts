import {
	type CreatePlaybookBody,
	type Deliverable,
	GATES,
	type Gate,
	type GatePolicy,
	type Playbook,
	type PlaybookGate,
	type UpdatePlaybookBody,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { type Change, fieldChanges } from "./what-changes";

/*
 * The playbook builder's model (ruling 36): the pipeline the canvas draws,
 * how the keyboard moves along it, the draft the operator edits, and the
 * bodies Publish and New playbook send. Pure, so it is tested directly.
 */

export type PipelineNode =
	| { id: `wave-${Wave}`; kind: "wave"; wave: Wave; applicable: boolean }
	| { id: `gate-${Gate}`; kind: "gate"; gate: Gate; policy: GatePolicy }
	| { id: "deliverable"; kind: "deliverable"; deliverable: Deliverable };

export type NodeId = PipelineNode["id"];

/**
 * The rail, top to bottom: every wave A to E (the ones the playbook runs
 * live, the rest skipped), then its gates in stored order, then the
 * deliverable, which ends it. The contract ties no gate to a wave, so gates
 * follow the waves rather than sitting between them.
 */
export function pipelineOf(
	playbook: Pick<Playbook, "wavesApplicable" | "gates" | "deliverable">,
): PipelineNode[] {
	const runs = new Set<Wave>(playbook.wavesApplicable);
	return [
		...WAVES.map(
			(wave): PipelineNode => ({
				id: `wave-${wave}`,
				kind: "wave",
				wave,
				applicable: runs.has(wave),
			}),
		),
		...playbook.gates.map(
			({ gate, policy }): PipelineNode => ({
				id: `gate-${gate}`,
				kind: "gate",
				gate,
				policy,
			}),
		),
		{
			id: "deliverable",
			kind: "deliverable",
			deliverable: playbook.deliverable,
		},
	];
}

/**
 * Where an arrow key moves the selection along the rail. Up and Left go
 * back, Down and Right go on; Home and End go to the ends. With nothing
 * selected, any of them starts at the first node. Null for any other key.
 */
export function moveSelection(
	nodes: readonly PipelineNode[],
	current: NodeId | null,
	key: string,
): NodeId | null {
	if (nodes.length === 0) return null;
	const first = nodes[0]?.id ?? null;
	const last = nodes.at(-1)?.id ?? null;
	const at = nodes.findIndex((n) => n.id === current);
	switch (key) {
		case "Home":
			return first;
		case "End":
			return last;
		case "ArrowDown":
		case "ArrowRight":
			return at === -1
				? first
				: (nodes[Math.min(at + 1, nodes.length - 1)]?.id ?? null);
		case "ArrowUp":
		case "ArrowLeft":
			return at === -1 ? first : (nodes[Math.max(at - 1, 0)]?.id ?? null);
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// The draft.

export type PlaybookDraft = Pick<
	Playbook,
	"name" | "deliverable" | "wavesApplicable" | "gates" | "requiredFields"
>;

export function draftOf(playbook: Playbook): PlaybookDraft {
	return {
		name: playbook.name,
		deliverable: playbook.deliverable,
		// In WAVES order, as every edit keeps them, so order alone is no change.
		wavesApplicable: WAVES.filter((w) => playbook.wavesApplicable.includes(w)),
		gates: playbook.gates.map((g) => ({ ...g })),
		requiredFields: [...playbook.requiredFields],
	};
}

export type DraftAction =
	| { type: "toggleWave"; wave: Wave }
	| { type: "addGate"; gate: Gate }
	| { type: "removeGate"; gate: Gate }
	| { type: "setPolicy"; gate: Gate; policy: GatePolicy }
	| { type: "setDeliverable"; deliverable: Deliverable }
	| { type: "setName"; name: string }
	| { type: "addField"; field: string }
	| { type: "removeField"; field: string }
	| { type: "reset"; to: PlaybookDraft };

/**
 * One edit to the draft. Waves stay in WAVES order whatever order they were
 * toggled in. A gate is added once, at the end, as mandatory; the gate
 * vocabulary is closed, so only its names can be added.
 */
export function draftReducer(
	draft: PlaybookDraft,
	action: DraftAction,
): PlaybookDraft {
	switch (action.type) {
		case "toggleWave": {
			const on = draft.wavesApplicable.includes(action.wave);
			const next = new Set<Wave>(draft.wavesApplicable);
			if (on) next.delete(action.wave);
			else next.add(action.wave);
			return { ...draft, wavesApplicable: WAVES.filter((w) => next.has(w)) };
		}
		case "addGate":
			return draft.gates.some((g) => g.gate === action.gate)
				? draft
				: {
						...draft,
						gates: [...draft.gates, { gate: action.gate, policy: "mandatory" }],
					};
		case "removeGate":
			return {
				...draft,
				gates: draft.gates.filter((g) => g.gate !== action.gate),
			};
		case "setPolicy":
			return {
				...draft,
				gates: draft.gates.map((g) =>
					g.gate === action.gate ? { ...g, policy: action.policy } : g,
				),
			};
		case "setDeliverable":
			return { ...draft, deliverable: action.deliverable };
		case "setName":
			return { ...draft, name: action.name };
		case "addField": {
			const field = action.field.trim();
			return field === "" || draft.requiredFields.includes(field)
				? draft
				: { ...draft, requiredFields: [...draft.requiredFields, field] };
		}
		case "reset":
			return action.to;
		case "removeField":
			return {
				...draft,
				requiredFields: draft.requiredFields.filter((f) => f !== action.field),
			};
	}
}

/** The gates the closed vocabulary still offers to add, in vocabulary order. */
export function addableGates(gates: readonly PlaybookGate[]): Gate[] {
	const present = new Set(gates.map((g) => g.gate));
	return GATES.filter((g) => !present.has(g));
}

const gateLine = (gates: readonly PlaybookGate[]) =>
	gates.map((g) => `${g.gate} ${g.policy}`);

/** What publishing the draft would change, for the dirty banner. */
export function draftChanges(stored: Playbook, draft: PlaybookDraft): Change[] {
	return fieldChanges(
		{ ...draftOf(stored), gates: gateLine(stored.gates) },
		{ ...draft, gates: gateLine(draft.gates) },
		[
			{ key: "name", label: "Name" },
			{ key: "deliverable", label: "Deliverable", mono: true },
			{ key: "wavesApplicable", label: "Waves", mono: true },
			{ key: "gates", label: "Gates", mono: true },
			{ key: "requiredFields", label: "Required fields", mono: true },
		],
	);
}

/**
 * The whole playbook as Publish sends it (PUT
 * /api/playbooks/by-type/:missionType, a full replace): the draft plus what
 * the builder does not edit.
 */
export function playbookBodyOf(
	stored: Playbook,
	draft: PlaybookDraft,
): UpdatePlaybookBody {
	return {
		name: draft.name.trim(),
		wavesApplicable: draft.wavesApplicable,
		gates: draft.gates,
		deliverable: draft.deliverable,
		requiredFields: draft.requiredFields,
		defaultPresetId: stored.defaultPresetId,
	};
}

/** Where a new playbook starts: blank, or a copy of one that exists. */
export type NewPlaybookStart =
	| { kind: "blank" }
	| { kind: "copy"; from: Playbook };

/** A blank playbook: wave A only, no gates, a pull request, no fields. */
export const BLANK_PROCESS = {
	wavesApplicable: ["A"],
	gates: [],
	deliverable: "pr",
	requiredFields: [],
} as const satisfies Pick<
	CreatePlaybookBody,
	"wavesApplicable" | "gates" | "deliverable" | "requiredFields"
>;

/**
 * The POST body for a new playbook: its type, name and preset as typed, and
 * its process from the start chosen. A copy takes the waves, gates,
 * deliverable and fields, never the type or name.
 */
export function newPlaybookBody(
	missionType: string,
	name: string,
	defaultPresetId: string,
	start: NewPlaybookStart,
): CreatePlaybookBody {
	const process =
		start.kind === "blank"
			? BLANK_PROCESS
			: {
					wavesApplicable: start.from.wavesApplicable,
					gates: start.from.gates,
					deliverable: start.from.deliverable,
					requiredFields: start.from.requiredFields,
				};
	return {
		missionType: missionType.trim(),
		name: name.trim(),
		wavesApplicable: [...process.wavesApplicable],
		gates: process.gates.map((g) => ({ ...g })),
		deliverable: process.deliverable,
		requiredFields: [...process.requiredFields],
		defaultPresetId,
	};
}
