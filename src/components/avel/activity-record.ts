import type { ActivityAction, ActivityEntry } from "avel-server/contract";

/*
 * The decision record's rules (ruling 36): how each action is undone, and
 * how an entry's payload reads. Pure, so they are tested directly. Keyed on
 * the contract's action union: a new action fails the build until it says
 * whether it has an inverse.
 */

/** A contract request that undoes an action, named as the contract names it. */
export type Inverse = { request: string; route: string; note: string };

/**
 * How each action is reversed: the contract request that undoes it, or null
 * when none does. Only requests the contract already has are named (ruling
 * 35): nothing here proposes a new route.
 */
export const INVERSE = {
	"client.created": null,
	"client.updated": {
		request: "clients.update",
		route: "PATCH /api/clients/:id",
		note: "Set the changed fields back, including the status if this flipped it.",
	},
	"engagement.created": null,
	"engagement.updated": {
		request: "engagements.update",
		route: "PATCH /api/engagements/:id",
		note: "Set the changed fields back.",
	},
	"engagement.closed": null,
	"auth.signed_in": null,
	"connection.revoked": null,
	"mission.created": null,
	"mission.status_changed": null,
	"export.created": null,
	"export.status_changed": null,
	"intake.created": null,
	"intake.updated": null,
	"intake.proposed": null,
	"intake.approved": null,
	"intake.rejected": null,
	"skill_source.created": {
		request: "skillSources.remove",
		route: "DELETE /api/skill-sources/:id",
		note: "Removes the source again.",
	},
	"skill_source.updated": {
		request: "skillSources.update",
		route: "PATCH /api/skill-sources/:id",
		note: "Set the changed fields back.",
	},
	"skill_source.deleted": null,
	"skill.created": null,
	"skill.updated": null,
	"skill.approved": {
		request: "skills.retire",
		route: "POST /api/skills/:id/retire",
		note: "Retires the skill. It cannot return to draft.",
	},
	"skill.retired": null,
	"roster.entry_added": {
		request: "roster.remove",
		route: "DELETE /api/missions/:missionId/roster/:entryId",
		note: "Removes the entry from the mission's roster.",
	},
	"roster.entry_updated": {
		request: "roster.update",
		route: "PATCH /api/missions/:missionId/roster/:entryId",
		note: "Set the changed fields back, including active if this toggled it.",
	},
	"roster.entry_removed": null,
	"roster.preset_applied": null,
	"mission.skill_attached": {
		request: "roster.detachSkill",
		route: "DELETE /api/missions/:missionId/skills/:skillId",
		note: "Detaches the skill from the mission.",
	},
	"mission.skill_detached": {
		request: "roster.attachSkill",
		route: "POST /api/missions/:missionId/skills",
		note: "Attaches the skill again.",
	},
	"intake.repo_read": null,
	"connection.created": null,
	"preset.created": null,
	"preset.updated": {
		request: "presets.update",
		route: "PATCH /api/presets/:id",
		note: "Set the changed fields back. That makes a new version; the old one is not restored.",
	},
	"mission.plan_updated": {
		request: "missionPlans.update",
		route: "PUT /api/missions/:id/plan",
		note: "Put the earlier plan back, while the mission is a draft.",
	},
	"playbook.created": null,
	"playbook.updated": {
		request: "playbooks.update",
		route: "PUT /api/playbooks/by-type/:missionType",
		note: "Publish the earlier version's fields again. That makes a new version.",
	},
	// No contract request writes an agent template: the identity generator
	// does, and its versions are never changed or deleted.
	"agent_template.updated": null,
	"agent_template.identity_regenerated": null,
	// A dispatch runs once and its report is filed once: a halted or failed
	// run is followed by a new dispatch, never undone.
	"dispatch.created": null,
	"dispatch.started": null,
	"dispatch.soft_ceiling_crossed": null,
	"dispatch.halted": null,
	"dispatch.closed": null,
	"completion_report.filed": null,
} as const satisfies Record<ActivityAction, Inverse | null>;

/** Every entry is Applied while avel-server logs no refusals (ruling 36). */
export type ActivityResult = "Applied" | "Held" | "Stopped" | "Reverted";

export function resultOf(
	_entry: Pick<ActivityEntry, "action">,
): ActivityResult {
	return "Applied";
}

/**
 * One fact from a payload: its key as words, its value as text. An id or a
 * hash is never the text: `ref` carries the full value, for the record to
 * show as a hidden id or a seven-character hash, with Copy.
 */
export type PayloadFact = {
	key: string;
	label: string;
	value: string;
	mono: boolean;
	ref?: { kind: "id" | "hash"; full: string };
};

/** "presetVersion" → "Preset version", "checkPassed" → "Check passed". */
export function labelOf(key: string): string {
	const words = key
		.replace(/_/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A git commit (40) or a SHA-256 (64), in hex. */
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A value as one line: ids hidden, hashes short, lists counted, objects as JSON. */
function shown(value: unknown): Omit<PayloadFact, "key" | "label"> {
	if (value === null || value === undefined)
		return { value: "None", mono: false };
	if (typeof value === "boolean")
		return { value: value ? "Yes" : "No", mono: false };
	if (typeof value === "number") return { value: String(value), mono: true };
	if (typeof value === "string") {
		if (UUID.test(value))
			return { value: "Hidden", mono: false, ref: { kind: "id", full: value } };
		if (HASH.test(value))
			return { value: "", mono: true, ref: { kind: "hash", full: value } };
		return { value, mono: /^[a-z0-9_./:-]+$/.test(value) };
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return { value: "None", mono: false };
		if (value.every(isId)) {
			return {
				value:
					value.length === 1 ? "1 id, hidden" : `${value.length} ids, hidden`,
				mono: false,
				ref: { kind: "id", full: value.join(", ") },
			};
		}
		if (value.every((v) => typeof v === "string" || typeof v === "number")) {
			return { value: value.map(String).join(", "), mono: true };
		}
		return { value: `${value.length} items`, mono: false };
	}
	return { value: JSON.stringify(value), mono: true };
}

/**
 * The entity's own name when the entry carries one (a created client or
 * engagement logs its name), or null: the log has no other name to read,
 * and its id is never shown in its place.
 */
export function entityNameOf(
	entry: Pick<ActivityEntry, "payload">,
): string | null {
	// An agent template may log only its slug ("atlas"): a name it reads by.
	for (const key of ["name", "slug"]) {
		const value = entry.payload[key];
		if (typeof value === "string" && value.trim() !== "" && !UUID.test(value))
			return value;
	}
	return null;
}

/**
 * What an entry looked at, from its payload, one fact per key in the order
 * the server wrote them. The payload's shape is per action and open, so
 * nothing is assumed about it beyond its keys and values.
 */
export function payloadFacts(payload: Record<string, unknown>): PayloadFact[] {
	return Object.entries(payload).map(([key, value]) => ({
		key,
		label: labelOf(key),
		...shown(value),
	}));
}
