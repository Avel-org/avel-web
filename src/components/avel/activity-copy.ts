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
