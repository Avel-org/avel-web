import type { Gate } from "avel-server/contract";

/*
 * What avel-server's docs say about the gates, quoted, with where each quote
 * comes from. A gate's meaning is never written here from scratch: a gate
 * the docs do not define has none, and its page says module 9 will. Update
 * a quote only when the doc it cites changes.
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
