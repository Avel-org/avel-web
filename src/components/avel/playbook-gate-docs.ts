import type { Gate } from "avel-server/contract";

/*
 * What avel-server says about the gates, with where each line comes from:
 * its docs, quoted, and what its code checks today. A gate's meaning is
 * never written here from scratch. Update a line only when what it cites
 * changes.
 */

export type DocQuote = { text: string; source: string };

/** Each gate's definition in the docs, or null where the docs give none. */
export const GATE_DOCS = {
	"phase1-close": null,
	alignment: {
		text: 'It answers "Did phase 2 conform to phase 1?" The alignment gate is still an attestation. The data agent writes the contract; the state agent reads it and writes a file saying "this matches." Nothing verifies that claim.',
		source: "avel-server docs/CLIENT-CONTRACT-CONFORMANCE.md",
	},
	qa: null,
	security: null,
	rollback: null,
	acceptance: null,
} as const satisfies Record<Gate, DocQuote | null>;

/**
 * What feeds each gate today, as avel-server's code does it (GATE_CONFIG v1,
 * src/lib/gate; confirmed by the backend 2026-10-20), or null where nothing
 * does. Cited by file, as the doc quotes are; update it when the gate's
 * producers change.
 */
export const GATE_CHECKS = {
	"phase1-close": null,
	alignment: {
		text: "Spec-check: every requirement in the brief needs an acceptance criterion and a check the agent does not run itself. A check that cites no requirement, a repeated check id, or a brief with no requirements fails it.",
		source: "avel-server src/lib/gate/producers/spec-check.ts",
	},
	qa: {
		text: "The test-file checkpoint (builders and judges may not write tests; testers may write only tests), protected paths, and judge coverage. Breaking the checkpoint blocks, and no override clears it.",
		source:
			"avel-server src/lib/gate/producers/test-glob.ts, protected-paths.ts, judge-coverage.ts",
	},
	security: null,
	rollback: null,
	acceptance: {
		text: "The brief's own checks. A file_exists check is real evidence. Test, typecheck and command checks need the runner, which is not installed yet, so each warns as not run; a mandatory acceptance gate can pass on file_exists alone.",
		source: "avel-server src/lib/gate/producers/brief-checks.ts",
	},
} as const satisfies Record<Gate, DocQuote | null>;

/**
 * A gate nothing feeds still has to run: decide() gives it a not-run no
 * override clears ("The gate must run; no rationale stands in for
 * evidence", avel-server src/lib/gate/decide.ts). So its policy decides
 * every run.
 */
export function unfedGateEffect(policy: "mandatory" | "warn"): string {
	return policy === "mandatory"
		? "No check feeds this gate yet. Listed as mandatory, it blocks every gate run, and no override clears it."
		: "No check feeds this gate yet. Listed as warn, it warns on every gate run.";
}

/** What a policy means, as the docs put it. */
export const POLICY_DOCS: readonly DocQuote[] = [
	{
		text: "Gate policy is mandatory or warn only. Shipping past a red mandatory gate requires a written override that is rendered into the delivery and visible to the client.",
		source: "avel-server docs/GOLDEN-FIXTURE.md",
	},
	{
		text: "A gate result may be overridden by the operator with written rationale. A violation — writing where an agent was not permitted — never can be.",
		source: "avel-server docs/COMMAND-CENTER.md, module 9",
	},
];

/** The closed vocabulary, as the docs state it. */
export const VOCABULARY_DOC: DocQuote = {
	text: "Gate vocabulary is closed: phase1-close · alignment · qa · security · rollback · acceptance.",
	source: "avel-server docs/DATA-CONTRACTS-V2.md, Playbook",
};
