import type {
	ActivityAction,
	ActivityActorKind,
	ActivityEntityType,
} from "avel-server/contract";

/**
 * What each action says on the Activity page. Keyed on the contract's closed
 * activityAction enum and checked with `satisfies`, as the error map is: a
 * new action fails the build until it has copy here.
 */
export const ACTION_COPY = {
	"client.created": "Client created",
	"client.updated": "Client updated",
	"engagement.created": "Engagement created",
	"engagement.updated": "Engagement updated",
	"engagement.closed": "Engagement closed",
	"auth.signed_in": "Signed in",
	"connection.revoked": "Connection revoked",
	"mission.created": "Mission created",
	"mission.status_changed": "Mission status changed",
	"export.created": "Export created",
	"export.status_changed": "Export status changed",
	"intake.created": "Intake created",
	"intake.updated": "Intake updated",
	"intake.proposed": "Intake proposed",
	"intake.approved": "Intake approved",
	"intake.rejected": "Intake rejected",
	"skill_source.created": "Skill source added",
	"skill_source.updated": "Skill source updated",
	"skill_source.deleted": "Skill source deleted",
	"skill.created": "Skill created",
	"skill.updated": "Skill updated",
	"skill.approved": "Skill approved",
	"skill.retired": "Skill retired",
	"roster.entry_added": "Agent added to roster",
	"roster.entry_updated": "Roster entry updated",
	"roster.entry_removed": "Agent removed from roster",
	"roster.preset_applied": "Preset applied",
	"mission.skill_attached": "Skill attached to mission",
	"mission.skill_detached": "Skill detached from mission",
	"intake.repo_read": "Repository read for intake",
	"connection.created": "Connection added",
	"preset.created": "Preset created",
	"preset.updated": "Preset updated",
	"mission.plan_updated": "Mission plan updated",
	"playbook.created": "Playbook created",
	"playbook.updated": "Playbook published",
} as const satisfies Record<ActivityAction, string>;

/** The name of each entity type, singular, as a filter option and a row's "which". */
export const ENTITY_LABEL = {
	client: "Client",
	engagement: "Engagement",
	user: "User",
	connection: "Connection",
	mission: "Mission",
	export: "Export",
	intake: "Intake",
	skill_source: "Skill source",
	skill: "Skill",
	roster_entry: "Roster entry",
	roster_preset: "Preset",
	playbook: "Playbook",
} as const satisfies Record<ActivityEntityType, string>;

/**
 * Each actor kind, as the actor filter names it. A row shows the server's
 * actor.display instead (ActivityActor).
 */
export const ACTOR_KIND_LABEL = {
	operator: "Operator",
	system: "System",
	agent: "Agent",
} as const satisfies Record<ActivityActorKind, string>;
