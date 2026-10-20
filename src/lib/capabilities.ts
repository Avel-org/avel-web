/**
 * What the operator cannot do yet, and why, keyed by capability (audit F9).
 * One sentence per capability, the system's own reason, so the page button,
 * the command menu entry and their tooltips all say the same thing. When the
 * capability lands, delete its entry and the compiler finds every caller.
 */
export const NOT_YET = {
	"mission.create": "The contract cannot create missions yet.",
	// POST /api/connections exists; the form that sends it does not.
	"connection.create": "Adding a connection isn't wired into this page yet.",
} as const satisfies Record<string, string>;

export type NotYetCapability = keyof typeof NOT_YET;
